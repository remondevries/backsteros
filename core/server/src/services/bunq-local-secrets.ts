/**
 * H2 — bunq credentials live on cloud-core only. A local core may still hold
 * rows from before bunq_* stopped replicating; this clears them.
 *
 * Callable (and invoked by scripts/clear-local-bunq-secrets.ts, dry-run by
 * default). Refuses on a cloud core. Never run against the live local DB
 * implicitly — Remon invokes the script deliberately.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import { resolveReplicationRoleFromEnv } from "./core-replication/direction-policy.js";

/** Every bunq credential / session column nulled by the clear. */
export const LOCAL_BUNQ_CLEAR_PATCH = {
  bunqApiKey: null,
  bunqSigningPrivateKeyPem: null,
  bunqInstallationToken: null,
  bunqServerPublicKeyPem: null,
  bunqSessionToken: null,
  bunqSessionExpiresAt: null,
  bunqDeviceId: null,
  bunqUserId: null,
  bunqEnvironment: null,
  bunqLastConnectedAt: null,
} as const;

export class LocalBunqSecretsRefusedError extends Error {
  constructor() {
    super(
      "clearLocalBunqSecrets refused: CORE_REPLICATION_ROLE=cloud (cloud-core holds the bunq credentials)",
    );
    this.name = "LocalBunqSecretsRefusedError";
  }
}

export type ClearLocalBunqSecretsDeps = {
  env?: NodeJS.ProcessEnv;
  /** Count rows that currently hold any bunq credential (dry-run). */
  countRows?: (workspaceId: string | null) => Promise<number>;
  /** Null the bunq columns; returns rows touched. */
  clearRows?: (workspaceId: string | null) => Promise<number>;
};

const HAS_BUNQ_SECRET = sql`(
  ${workspaceIntegrationSecrets.bunqApiKey} is not null
  or ${workspaceIntegrationSecrets.bunqSigningPrivateKeyPem} is not null
  or ${workspaceIntegrationSecrets.bunqInstallationToken} is not null
  or ${workspaceIntegrationSecrets.bunqServerPublicKeyPem} is not null
  or ${workspaceIntegrationSecrets.bunqSessionToken} is not null
)`;

async function defaultCountRows(workspaceId: string | null): Promise<number> {
  const rows = await db
    .select({ id: workspaceIntegrationSecrets.workspaceId })
    .from(workspaceIntegrationSecrets)
    .where(
      workspaceId
        ? sql`${eq(workspaceIntegrationSecrets.workspaceId, workspaceId)} and ${HAS_BUNQ_SECRET}`
        : HAS_BUNQ_SECRET,
    );
  return rows.length;
}

async function defaultClearRows(workspaceId: string | null): Promise<number> {
  const rows = await db
    .update(workspaceIntegrationSecrets)
    .set({
      ...LOCAL_BUNQ_CLEAR_PATCH,
      bunqPermittedIps: [],
      updatedAt: new Date(),
    })
    .where(
      workspaceId
        ? sql`${eq(workspaceIntegrationSecrets.workspaceId, workspaceId)} and ${HAS_BUNQ_SECRET}`
        : HAS_BUNQ_SECRET,
    )
    .returning({ id: workspaceIntegrationSecrets.workspaceId });
  return rows.length;
}

/**
 * Null bunq_* secrets on a LOCAL core. `dryRun: true` only counts.
 * Throws LocalBunqSecretsRefusedError on a cloud core.
 */
export async function clearLocalBunqSecrets(
  options: { workspaceId?: string | null; dryRun?: boolean } = {},
  deps: ClearLocalBunqSecretsDeps = {},
): Promise<{ dryRun: boolean; affectedRows: number }> {
  const env = deps.env ?? process.env;
  if (resolveReplicationRoleFromEnv(env) === "cloud") {
    throw new LocalBunqSecretsRefusedError();
  }
  const workspaceId = options.workspaceId ?? null;
  const dryRun = options.dryRun ?? true;
  if (dryRun) {
    const count = await (deps.countRows ?? defaultCountRows)(workspaceId);
    return { dryRun: true, affectedRows: count };
  }
  const touched = await (deps.clearRows ?? defaultClearRows)(workspaceId);
  return { dryRun: false, affectedRows: touched };
}
