/**
 * Natural-key forks (OS-40).
 *
 * Some replicated tables have no deleted_at but carry a UNIQUE index on a
 * business key besides the primary key. When local and cloud each create
 * "their" row for the same business key (getOrCreate on both cores), the rows
 * get different primary ids. The generic upsert conflicts on id only, so the
 * second unique index raises 23505 on every apply and the row dead-letters.
 *
 * For these tables the business key is the identity: one row per key, newest
 * updated_at wins (whole row, including id), the loser is removed. The tie-break
 * is the larger id so both peers pick the same survivor without coordination.
 * Only register tables here whose primary id is not referenced by other rows.
 */

/** table -> natural key columns (must match a UNIQUE index on that table). */
export const NATURAL_KEY_TABLES: Readonly<Record<string, readonly string[]>> = {
  // space_publish_settings_workspace_space_uidx. space_site_keys reference
  // (workspace_id, space_document_id), not the settings id.
  space_publish_settings: ["workspace_id", "space_document_id"],
};

export function naturalKeyColumnsFor(table: string): readonly string[] | null {
  return NATURAL_KEY_TABLES[table] ?? null;
}

export type NaturalKeyRowMeta = {
  id: string;
  updatedAt: Date;
};

/**
 * Decide which row survives a natural-key fork. Deterministic and symmetric:
 * naturalKeyForkWinner(a, b) on one peer and naturalKeyForkWinner(b, a) on the
 * other always keep the same row.
 */
export function naturalKeyForkWinner(
  incoming: NaturalKeyRowMeta,
  existing: NaturalKeyRowMeta,
): "incoming" | "existing" {
  const incomingMs = incoming.updatedAt.getTime();
  const existingMs = existing.updatedAt.getTime();
  if (Number.isFinite(incomingMs) && Number.isFinite(existingMs)) {
    if (incomingMs > existingMs) return "incoming";
    if (incomingMs < existingMs) return "existing";
  } else if (Number.isFinite(incomingMs)) {
    return "incoming";
  } else if (Number.isFinite(existingMs)) {
    return "existing";
  }
  return incoming.id > existing.id ? "incoming" : "existing";
}
