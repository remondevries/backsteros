import type { ReplicationCursor } from "./types.js";

/** Compare replication watermarks: updatedAt then rowId. No DB dependency. */
export function compareCursor(a: ReplicationCursor, b: ReplicationCursor): number {
  const timeA = Date.parse(a.updatedAt);
  const timeB = Date.parse(b.updatedAt);
  if (timeA !== timeB) return timeA - timeB;
  return a.rowId.localeCompare(b.rowId);
}

export function maxCursor(
  current: ReplicationCursor,
  candidate: ReplicationCursor,
): ReplicationCursor {
  return compareCursor(candidate, current) > 0 ? candidate : current;
}

export function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
