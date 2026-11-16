/**
 * Replication direction + column-level guards — pure, no DB.
 *
 * Every replicated table flows BOTH ways again (local ↔ cloud), including
 * `api_keys`, `workspaces`, `agents` and `workspace_integration_secrets`
 * (desktop settings must reach cloud). Secret material is protected at the
 * column level instead of by whole-table one-way rules:
 *
 * - `workspace_integration_secrets`: `bunq_*` never on the wire
 *   (integration-secrets-replication.ts) — push strips, apply ignores.
 * - `agents`: webhook url + ciphertext never on the wire (agent-replication.ts).
 * - `api_keys`: a local core never sends `key_hash` / `secret_ciphertext`
 *   upstream; any apply keeps the existing values when the inbound ones are
 *   missing or empty.
 */

import type { CoreReplicationRole } from "./config.js";

export function resolveReplicationRoleFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CoreReplicationRole {
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud"
    ? "cloud"
    : "local";
}

/** api_keys columns that carry raw / recoverable secret material. */
export const API_KEY_SECRET_COLUMNS = [
  "secret_ciphertext",
  "key_hash",
] as const;

export type ApiKeySecretColumn = (typeof API_KEY_SECRET_COLUMNS)[number];

/**
 * Strip api_keys secret columns from an outbound row when this core is the
 * local role. Cloud keeps sending them: local needs `key_hash` to authenticate
 * cloud-minted keys. Returns the same object for other tables / roles.
 */
export function sanitizeApiKeysRowForOutbound(
  row: Record<string, unknown>,
  role: CoreReplicationRole,
): Record<string, unknown> {
  if (role !== "local") return row;
  const next = { ...row };
  for (const col of API_KEY_SECRET_COLUMNS) {
    delete next[col];
  }
  return next;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Pick the value to persist for an api_keys secret column: the inbound value
 * when it is a non-empty string, otherwise keep the existing one (never
 * overwrite with empty / stripped / null inbound values).
 */
export function preserveApiKeySecret(
  incoming: unknown,
  existing: string | null | undefined,
): string | null {
  return nonEmptyString(incoming) ?? nonEmptyString(existing);
}
