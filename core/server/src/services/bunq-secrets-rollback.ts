/**
 * Rollback helper — decrypt `v1:` bunq secret columns back to plaintext so an
 * older build (c0475b9, which predates bunq-at-rest encryption) can read them.
 *
 * Cloud-oriented: refuses unless CORE_REPLICATION_ROLE=cloud, or the operator
 * passes an explicit `confirmCloud` (CLI `--confirm-cloud`) for a cloud DB
 * running without the role env. An explicit role=local is always refused.
 * Dry-run by default. Secrets are never returned or logged — only counts and
 * column names.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import {
  BUNQ_ENCRYPTED_SECRET_FIELDS,
  decryptBunqSecretFieldsForRollback,
  type BunqEncryptedSecretField,
} from "../lib/bunq-secret-crypto.js";

export class BunqRollbackRefusedError extends Error {
  constructor(reason: string) {
    super(`decryptBunqSecretsForRollback refused: ${reason}`);
    this.name = "BunqRollbackRefusedError";
  }
}

/** Refusal reason, or null when the rollback may proceed. */
export function bunqRollbackRefusalReason(
  env: NodeJS.ProcessEnv,
  confirmCloud: boolean,
): string | null {
  const role = env.CORE_REPLICATION_ROLE?.trim().toLowerCase();
  if (role === "local") {
    return "CORE_REPLICATION_ROLE=local (this script is for the cloud core)";
  }
  if (role === "cloud") return null;
  if (confirmCloud) return null;
  return "CORE_REPLICATION_ROLE is not 'cloud'; pass --confirm-cloud if this really is the cloud database";
}

export type BunqRollbackRow = {
  workspaceId: string;
} & Partial<Record<BunqEncryptedSecretField, string | null>>;

export type BunqRollbackDeps = {
  env?: NodeJS.ProcessEnv;
  /** Rows holding at least one `v1:` bunq column. */
  loadRows?: (workspaceId: string | null) => Promise<BunqRollbackRow[]>;
  /** Persist plaintext for the given columns. */
  applyPatch?: (
    workspaceId: string,
    patch: Partial<Record<BunqEncryptedSecretField, string>>,
  ) => Promise<void>;
};

export type BunqRollbackResult = {
  dryRun: boolean;
  /** Workspace rows with at least one decryptable `v1:` column. */
  rows: number;
  /** Columns decrypted (dry-run: would be decrypted). */
  columns: number;
  /** Columns that are ciphertext but could not be decrypted with any key. */
  failedColumns: Array<{
    workspaceId: string;
    field: BunqEncryptedSecretField;
  }>;
};

const HAS_ENCRYPTED_BUNQ_SECRET = sql`(
  ${workspaceIntegrationSecrets.bunqApiKey} like 'v1:%'
  or ${workspaceIntegrationSecrets.bunqSigningPrivateKeyPem} like 'v1:%'
  or ${workspaceIntegrationSecrets.bunqInstallationToken} like 'v1:%'
  or ${workspaceIntegrationSecrets.bunqSessionToken} like 'v1:%'
)`;

async function defaultLoadRows(
  workspaceId: string | null,
): Promise<BunqRollbackRow[]> {
  return db
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
 * Decrypt `v1:` bunq columns back to plaintext. `dryRun` (default true) only
 * counts. Throws BunqRollbackRefusedError when the environment is not the
 * cloud core (see bunqRollbackRefusalReason).
 */
export async function decryptBunqSecretsForRollback(
  options: {
    workspaceId?: string | null;
    dryRun?: boolean;
    confirmCloud?: boolean;
  } = {},
  deps: BunqRollbackDeps = {},
): Promise<BunqRollbackResult> {
  const env = deps.env ?? process.env;
  const refusal = bunqRollbackRefusalReason(env, options.confirmCloud ?? false);
  if (refusal) throw new BunqRollbackRefusedError(refusal);

  const dryRun = options.dryRun ?? true;
  const rows = await (deps.loadRows ?? defaultLoadRows)(
    options.workspaceId ?? null,
  );
  const apply = deps.applyPatch ?? defaultApplyPatch;

  const result: BunqRollbackResult = {
    dryRun,
    rows: 0,
    columns: 0,
    failedColumns: [],
  };
  for (const row of rows) {
    const { patch, failed } = decryptBunqSecretFieldsForRollback(row, env);
    for (const field of failed) {
      result.failedColumns.push({ workspaceId: row.workspaceId, field });
    }
    const columns = BUNQ_ENCRYPTED_SECRET_FIELDS.filter(
      (field) => patch[field] !== undefined,
    ).length;
    if (columns === 0) continue;
    result.rows += 1;
    result.columns += columns;
    if (!dryRun) await apply(row.workspaceId, patch);
  }
  return result;
}
