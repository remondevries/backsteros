/**
 * Re-seal bunq secret columns onto BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY.
 *
 * Covers:
 *  - ciphertext still under CORE_REPLICATION_SECRET / BACKSTEROS_SECRET_ENCRYPTION_KEY
 *  - plaintext values left on cloud (API key / PEM never Connect'd)
 *
 * Cloud-only. Dry-run by default. Never prints secret values. No bunq HTTP.
 * No-ops when the dedicated key is unset. --apply refuses while the cloud
 * core is responding on its health endpoint, and each column write is a
 * compare-and-set against the value that was planned.
 */

import { eq, sql } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import {
  BUNQ_ENCRYPTED_SECRET_FIELDS,
  bunqSecretEncryptionKeyMaterial,
  decryptBunqSecret,
  encryptBunqSecret,
  isEncryptedBunqSecret,
  type BunqEncryptedSecretField,
} from "../lib/bunq-secret-crypto.js";
import {
  decryptSecretWithKeyMaterials,
} from "../lib/auto-review-webhook.js";

export class BunqReencryptRefusedError extends Error {
  constructor(reason: string) {
    super(`reencryptBunqSecretsToDedicatedKey refused: ${reason}`);
    this.name = "BunqReencryptRefusedError";
  }
}

/** Refuse unless positively cloud. */
export function bunqReencryptRefusalReason(
  env: NodeJS.ProcessEnv,
): string | null {
  const role = env.CORE_REPLICATION_ROLE?.trim().toLowerCase();
  if (role === "local") {
    return "CORE_REPLICATION_ROLE=local (re-encrypt is cloud-only)";
  }
  if (role !== "cloud") {
    return "CORE_REPLICATION_ROLE must be explicitly 'cloud'";
  }
  return null;
}

/** Health URL used to detect a running cloud core before --apply. */
export function cloudCoreHealthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.PORT?.trim() || "8788";
  const host = env.CORE_HEALTH_HOST?.trim() || "127.0.0.1";
  return `http://${host}:${port}/health`;
}

/**
 * True when GET /health returns `{ ok: true }` — the cloud core process is up.
 * Connection errors / non-ok responses mean it is safe to --apply.
 */
export async function probeCloudCoreRunning(deps: {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<boolean> {
  const env = deps.env ?? process.env;
  const url = cloudCoreHealthUrl(env);
  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 1500;
  try {
    const response = await fetchFn(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body?.ok === true;
  } catch {
    return false;
  }
}

export type BunqReencryptRow = {
  workspaceId: string;
} & Partial<Record<BunqEncryptedSecretField, string | null>>;

export type BunqReencryptApplyResult = {
  written: number;
  casSkipped: number;
};

export type BunqReencryptDeps = {
  env?: NodeJS.ProcessEnv;
  loadRows?: (workspaceId: string | null) => Promise<BunqReencryptRow[]>;
  applyPatch?: (
    workspaceId: string,
    patch: Partial<Record<BunqEncryptedSecretField, string>>,
    expected: Partial<Record<BunqEncryptedSecretField, string | null>>,
  ) => Promise<BunqReencryptApplyResult>;
  probeCoreRunning?: () => Promise<boolean>;
};

export type BunqReencryptResult = {
  dryRun: boolean;
  /** Dedicated key was missing — nothing to do. */
  skippedNoKey: boolean;
  /** Workspace rows inspected that had at least one bunq secret column. */
  rows: number;
  /** Columns that would be / were written under the dedicated key. */
  columns: number;
  /** Subset of `columns` that were plaintext (not `v1:`) before the pass. */
  plaintextColumns: number;
  /** Already under the dedicated key (left alone). */
  alreadyDedicated: number;
  /** Compare-and-set skipped because the stored value changed under us. */
  casSkipped: number;
  /** Ciphertext that could not be decrypted with any key. */
  failedColumns: Array<{
    workspaceId: string;
    field: BunqEncryptedSecretField;
  }>;
};

const FIELD_TO_DB_COLUMN: Record<BunqEncryptedSecretField, string> = {
  bunqApiKey: "bunq_api_key",
  bunqSigningPrivateKeyPem: "bunq_signing_private_key_pem",
  bunqInstallationToken: "bunq_installation_token",
  bunqSessionToken: "bunq_session_token",
};

/**
 * Pure: decide which fields need sealing under the dedicated key.
 * Encrypts plaintext and re-seals ciphertext still under the old shared key.
 */
export function planBunqReencryptForRow(
  row: Partial<Record<BunqEncryptedSecretField, string | null | undefined>>,
  env: NodeJS.ProcessEnv,
): {
  patch: Partial<Record<BunqEncryptedSecretField, string>>;
  /** Old values for compare-and-set writes. */
  expected: Partial<Record<BunqEncryptedSecretField, string | null>>;
  alreadyDedicated: BunqEncryptedSecretField[];
  failed: BunqEncryptedSecretField[];
  plaintextFields: BunqEncryptedSecretField[];
} {
  const dedicated = bunqSecretEncryptionKeyMaterial(env);
  const patch: Partial<Record<BunqEncryptedSecretField, string>> = {};
  const expected: Partial<Record<BunqEncryptedSecretField, string | null>> = {};
  const alreadyDedicated: BunqEncryptedSecretField[] = [];
  const failed: BunqEncryptedSecretField[] = [];
  const plaintextFields: BunqEncryptedSecretField[] = [];
  if (!dedicated) {
    return { patch, expected, alreadyDedicated, failed, plaintextFields };
  }
  for (const field of BUNQ_ENCRYPTED_SECRET_FIELDS) {
    const value = row[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const stored = value.trim();

    if (isEncryptedBunqSecret(stored)) {
      if (decryptSecretWithKeyMaterials(stored, [dedicated]) !== null) {
        alreadyDedicated.push(field);
        continue;
      }
      const plaintext = decryptBunqSecret(stored, env);
      if (plaintext === null) {
        failed.push(field);
        continue;
      }
      patch[field] = encryptBunqSecret(plaintext, env);
      expected[field] = stored;
      continue;
    }

    // Plaintext (legacy / never Connect'd).
    plaintextFields.push(field);
    patch[field] = encryptBunqSecret(stored, env);
    expected[field] = stored;
  }
  return { patch, expected, alreadyDedicated, failed, plaintextFields };
}

const HAS_BUNQ_SECRET_VALUE = sql`(
  (nullif(btrim(${workspaceIntegrationSecrets.bunqApiKey}), '') is not null)
  or (nullif(btrim(${workspaceIntegrationSecrets.bunqSigningPrivateKeyPem}), '') is not null)
  or (nullif(btrim(${workspaceIntegrationSecrets.bunqInstallationToken}), '') is not null)
  or (nullif(btrim(${workspaceIntegrationSecrets.bunqSessionToken}), '') is not null)
)`;

async function defaultLoadRows(
  workspaceId: string | null,
): Promise<BunqReencryptRow[]> {
  const rows = await db
    .select({
      workspaceId: workspaceIntegrationSecrets.workspaceId,
      bunqApiKey: workspaceIntegrationSecrets.bunqApiKey,
      bunqSigningPrivateKeyPem:
        workspaceIntegrationSecrets.bunqSigningPrivateKeyPem,
      bunqInstallationToken: workspaceIntegrationSecrets.bunqInstallationToken,
      bunqSessionToken: workspaceIntegrationSecrets.bunqSessionToken,
    })
    .from(workspaceIntegrationSecrets)
    .where(
      workspaceId
        ? sql`${eq(workspaceIntegrationSecrets.workspaceId, workspaceId)} and ${HAS_BUNQ_SECRET_VALUE}`
        : HAS_BUNQ_SECRET_VALUE,
    );
  return rows;
}

/**
 * Per-column compare-and-set so a concurrent session refresh is never
 * overwritten with a stale re-sealed value.
 */
export async function defaultApplyPatchWithCas(
  workspaceId: string,
  patch: Partial<Record<BunqEncryptedSecretField, string>>,
  expected: Partial<Record<BunqEncryptedSecretField, string | null>>,
): Promise<BunqReencryptApplyResult> {
  let written = 0;
  let casSkipped = 0;
  for (const field of BUNQ_ENCRYPTED_SECRET_FIELDS) {
    const next = patch[field];
    if (typeof next !== "string") continue;
    const col = FIELD_TO_DB_COLUMN[field];
    const oldValue = expected[field] ?? null;
    const result = await sqlClient.unsafe(
      `UPDATE workspace_integration_secrets
       SET ${col} = $1, updated_at = now()
       WHERE workspace_id = $2
         AND ${col} IS NOT DISTINCT FROM $3`,
      [next, workspaceId, oldValue] as never[],
    );
    const count =
      typeof result === "object" &&
      result !== null &&
      "count" in result &&
      typeof (result as { count?: unknown }).count === "number"
        ? (result as { count: number }).count
        : Array.isArray(result)
          ? result.length
          : 0;
    if (count > 0) written += 1;
    else casSkipped += 1;
  }
  return { written, casSkipped };
}

/**
 * Dry-run by default. When `--apply` / dryRun:false, writes sealed columns
 * only if the cloud core is not responding and each CAS matches.
 * Never returns secret values.
 */
export async function reencryptBunqSecretsToDedicatedKey(
  options: {
    workspaceId?: string | null;
    dryRun?: boolean;
  } = {},
  deps: BunqReencryptDeps = {},
): Promise<BunqReencryptResult> {
  const env = deps.env ?? process.env;
  const refusal = bunqReencryptRefusalReason(env);
  if (refusal) throw new BunqReencryptRefusedError(refusal);

  const dryRun = options.dryRun ?? true;
  if (!bunqSecretEncryptionKeyMaterial(env)) {
    return {
      dryRun,
      skippedNoKey: true,
      rows: 0,
      columns: 0,
      plaintextColumns: 0,
      alreadyDedicated: 0,
      casSkipped: 0,
      failedColumns: [],
    };
  }

  if (!dryRun) {
    const running = await (deps.probeCoreRunning ??
      (() => probeCloudCoreRunning({ env })))();
    if (running) {
      throw new BunqReencryptRefusedError(
        `cloud core is responding at ${cloudCoreHealthUrl(env)}; stop it before --apply (e.g. docker compose -f deploy/cloud/docker-compose.yml stop backsteros)`,
      );
    }
  }

  const workspaceId = options.workspaceId ?? null;
  const rows = await (deps.loadRows ?? defaultLoadRows)(workspaceId);
  let plannedColumns = 0;
  let writtenColumns = 0;
  let plaintextColumns = 0;
  let alreadyDedicated = 0;
  let casSkipped = 0;
  const failedColumns: BunqReencryptResult["failedColumns"] = [];

  for (const row of rows) {
    const plan = planBunqReencryptForRow(row, env);
    alreadyDedicated += plan.alreadyDedicated.length;
    for (const field of plan.failed) {
      failedColumns.push({ workspaceId: row.workspaceId, field });
    }
    const changed = Object.keys(plan.patch).length;
    if (changed === 0) continue;
    plannedColumns += changed;
    plaintextColumns += plan.plaintextFields.length;
    if (!dryRun) {
      const applyResult = await (deps.applyPatch ?? defaultApplyPatchWithCas)(
        row.workspaceId,
        plan.patch,
        plan.expected,
      );
      writtenColumns += applyResult.written;
      casSkipped += applyResult.casSkipped;
    }
  }

  return {
    dryRun,
    skippedNoKey: false,
    rows: rows.length,
    columns: dryRun ? plannedColumns : writtenColumns,
    plaintextColumns,
    alreadyDedicated,
    casSkipped,
    failedColumns,
  };
}
