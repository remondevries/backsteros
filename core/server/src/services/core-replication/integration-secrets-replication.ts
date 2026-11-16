/**
 * workspace_integration_secrets on the wire.
 *
 * bunq credentials (and the payments-paused kill switch) are cloud-held and
 * never leave the core that owns them. Everything else on the row (Cursor,
 * Zernio, … twin-only secrets) keeps its existing behaviour; only `bunq_*`
 * columns are stripped here.
 */

const BUNQ_COLUMN_PREFIX = "bunq_";

/** True for any column that must never be replicated off the owning core. */
export function isBunqSecretColumn(column: string): boolean {
  return column.toLowerCase().startsWith(BUNQ_COLUMN_PREFIX);
}

/** Strip every bunq_* column so apply omits them (preserves the peer's values). */
export function sanitizeWorkspaceIntegrationSecretsRowForReplication(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (isBunqSecretColumn(key)) continue;
    next[key] = value;
  }
  return next;
}
