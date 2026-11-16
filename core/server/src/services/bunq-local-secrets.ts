/**
 * H2 — bunq credentials live on cloud-core only. A local core may still hold
 * rows from before bunq_* stopped replicating; this clears them.
 *
 * Callable (and invoked by scripts/clear-local-bunq-secrets.ts, dry-run by
 * default). Refuses unless POSITIVELY local: CORE_REPLICATION_ROLE=local set
 * explicitly and DATABASE_URL on a loopback host. Never run against the live
 * local DB implicitly — Remon invokes the script deliberately.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
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
  constructor(
    reason: string = "CORE_REPLICATION_ROLE=cloud (cloud-core holds the bunq credentials)",
  ) {
    super(`clearLocalBunqSecrets refused: ${reason}`);
    this.name = "LocalBunqSecretsRefusedError";
  }
}

const LOOPBACK_DB_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Host of DATABASE_URL, or null when absent / unparseable. */
export function databaseHostFromEnv(env: NodeJS.ProcessEnv): string | null {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.trim().toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Positive local verification. Returns a refusal reason, or null when the
 * environment is provably a local core: `CORE_REPLICATION_ROLE=local` set
 * explicitly (unset is NOT enough) AND `DATABASE_URL` on a loopback host.
 */
export function localBunqClearRefusalReason(
  env: NodeJS.ProcessEnv,
): string | null {
  const role = env.CORE_REPLICATION_ROLE?.trim().toLowerCase();
  if (role !== "local") {
    return role === "cloud"
      ? "CORE_REPLICATION_ROLE=cloud (cloud-core holds the bunq credentials)"
      : "CORE_REPLICATION_ROLE must be explicitly 'local' (unset is not enough)";
  }
  const host = databaseHostFromEnv(env);
  if (!host) {
    return "DATABASE_URL is missing or unparseable; cannot verify a loopback database";
  }
  if (!LOOPBACK_DB_HOSTS.has(host)) {
    return `DATABASE_URL host '${host}' is not loopback (127.0.0.1/localhost)`;
  }
  return null;
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
 * Throws LocalBunqSecretsRefusedError unless the env is positively local
 * (applies to dry-run too).
 */
export async function clearLocalBunqSecrets(
  options: { workspaceId?: string | null; dryRun?: boolean } = {},
  deps: ClearLocalBunqSecretsDeps = {},
): Promise<{ dryRun: boolean; affectedRows: number }> {
  const env = deps.env ?? process.env;
  const refusal = localBunqClearRefusalReason(env);
  if (refusal) {
    throw new LocalBunqSecretsRefusedError(refusal);
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
