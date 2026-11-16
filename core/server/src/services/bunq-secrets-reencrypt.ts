/**
 * Re-seal bunq secret columns still encrypted under the old shared key
 * (BACKSTEROS_SECRET_ENCRYPTION_KEY / CORE_REPLICATION_SECRET) onto
 * BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY.
 *
 * Cloud-only. Dry-run by default. Never prints secret values. No bunq HTTP.
 * No-ops when the dedicated key is unset.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
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

export type BunqReencryptRow = {
  workspaceId: string;
} & Partial<Record<BunqEncryptedSecretField, string | null>>;

export type BunqReencryptDeps = {
  env?: NodeJS.ProcessEnv;
  loadRows?: (workspaceId: string | null) => Promise<BunqReencryptRow[]>;
  applyPatch?: (
    workspaceId: string,
    patch: Partial<Record<BunqEncryptedSecretField, string>>,
  ) => Promise<void>;
};

export type BunqReencryptResult = {
  dryRun: boolean;
  /** Dedicated key was missing — nothing to do. */
  skippedNoKey: boolean;
  /** Workspace rows inspected that had at least one v1: column. */
  rows: number;
  /** Columns that would be / were re-sealed under the dedicated key. */
  columns: number;
  /** Already under the dedicated key (left alone). */
  alreadyDedicated: number;
  /** Ciphertext that could not be decrypted with any key. */
  failedColumns: Array<{
    workspaceId: string;
    field: BunqEncryptedSecretField;
  }>;
};

/**
 * Pure: decide which encrypted fields need re-sealing under the dedicated key.
 */
export function planBunqReencryptForRow(
  row: Partial<Record<BunqEncryptedSecretField, string | null | undefined>>,
  env: NodeJS.ProcessEnv,
): {
  patch: Partial<Record<BunqEncryptedSecretField, string>>;
  alreadyDedicated: BunqEncryptedSecretField[];
  failed: BunqEncryptedSecretField[];
} {
  const dedicated = bunqSecretEncryptionKeyMaterial(env);
  const patch: Partial<Record<BunqEncryptedSecretField, string>> = {};
  const alreadyDedicated: BunqEncryptedSecretField[] = [];
  const failed: BunqEncryptedSecretField[] = [];
  if (!dedicated) {
    return { patch, alreadyDedicated, failed };
  }
  for (const field of BUNQ_ENCRYPTED_SECRET_FIELDS) {
    const value = row[field];
    if (typeof value !== "string" || !isEncryptedBunqSecret(value)) continue;
    const stored = value.trim();
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
  }
  return { patch, alreadyDedicated, failed };
}

const HAS_ENCRYPTED_BUNQ_SECRET = sql`(
  ${workspaceIntegrationSecrets.bunqApiKey} like 'v1:%'
  or ${workspaceIntegrationSecrets.bunqSigningPrivateKeyPem} like 'v1:%'
  or ${workspaceIntegrationSecrets.bunqInstallationToken} like 'v1:%'
  or ${workspaceIntegrationSecrets.bunqSessionToken} like 'v1:%'
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
        ? sql`${eq(workspaceIntegrationSecrets.workspaceId, workspaceId)} and ${HAS_ENCRYPTED_BUNQ_SECRET}`
        : HAS_ENCRYPTED_BUNQ_SECRET,
    );
  return rows;
}

async function defaultApplyPatch(
  workspaceId: string,
  patch: Partial<Record<BunqEncryptedSecretField, string>>,
): Promise<void> {
  await db
    .update(workspaceIntegrationSecrets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
}

/**
 * Dry-run by default. When `--apply` / dryRun:false, writes re-sealed columns.
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
      alreadyDedicated: 0,
      failedColumns: [],
    };
  }

  const workspaceId = options.workspaceId ?? null;
  const rows = await (deps.loadRows ?? defaultLoadRows)(workspaceId);
  let columns = 0;
  let alreadyDedicated = 0;
  const failedColumns: BunqReencryptResult["failedColumns"] = [];

  for (const row of rows) {
    const plan = planBunqReencryptForRow(row, env);
    alreadyDedicated += plan.alreadyDedicated.length;
    for (const field of plan.failed) {
      failedColumns.push({ workspaceId: row.workspaceId, field });
    }
    const changed = Object.keys(plan.patch).length;
    if (changed === 0) continue;
    columns += changed;
    if (!dryRun) {
      await (deps.applyPatch ?? defaultApplyPatch)(row.workspaceId, plan.patch);
    }
  }

  return {
    dryRun,
    skippedNoKey: false,
    rows: rows.length,
    columns,
    alreadyDedicated,
    failedColumns,
  };
}
