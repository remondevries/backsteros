/**
 * OS-49: helpers for applying peer sync_events without freshening timestamps
 * or letting stale payloads win over newer local rows.
 */

/** Resolve the authoritative row time from a sync_event (payload wins). */
export function resolvePeerEventUpdatedAt(input: {
  payload: Record<string, unknown>;
  createdAt: Date;
}): Date {
  const raw = input.payload.updated_at ?? input.payload.updatedAt;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const fromNumber = new Date(raw);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber;
  }
  if (typeof raw === "string" && raw.trim()) {
    const fromString = new Date(raw);
    if (!Number.isNaN(fromString.getTime())) return fromString;
  }
  return input.createdAt;
}

/**
 * Skip applying a peer event when the local row is strictly newer.
 * Equal timestamps still apply (idempotent replay of the same version).
 */
export function shouldSkipPeerEventAsStale(
  eventUpdatedAt: Date,
  localUpdatedAt: Date | null | undefined,
): boolean {
  if (!localUpdatedAt) return false;
  return localUpdatedAt.getTime() > eventUpdatedAt.getTime();
}
