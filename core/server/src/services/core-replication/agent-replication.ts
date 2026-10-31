/**
 * Agent persona twin for core-replication.
 *
 * Replicate roster fields so local-core can validate Lead agent picks.
 * Never put webhook URL or secret ciphertext on the wire — Channel Connect
 * resolves those on cloud-core (forward from local when hybrid).
 */

/** Columns that must never leave the core that holds agent webhook credentials. */
export const AGENT_WEBHOOK_SECRET_COLUMNS = [
  "webhook_url",
  "webhook_secret_ciphertext",
] as const;

export type AgentWebhookSecretColumn =
  (typeof AGENT_WEBHOOK_SECRET_COLUMNS)[number];

/** Strip webhook URL + ciphertext so apply omits them (preserves peer secrets). */
export function sanitizeAgentsRowForReplication(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...row };
  for (const col of AGENT_WEBHOOK_SECRET_COLUMNS) {
    delete next[col];
  }
  return next;
}
