function updatedAtMs(value: string | number | Date | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Merge PowerSync + API rows by id.
 * Starts from local rows, then upserts API rows that are missing or newer.
 */
export function mergeLocalAndApiByUpdatedAt<
  T extends { id: string; updatedAt?: string | number | Date | null },
>(
  localRows: T[] | null | undefined,
  apiRows: T[] | null | undefined,
): T[] {
  if (localRows == null || localRows.length === 0) {
    return apiRows ?? localRows ?? [];
  }
  if (apiRows == null || apiRows.length === 0) {
    return localRows;
  }

  const byId = new Map(localRows.map((row) => [row.id, row]));
  for (const apiRow of apiRows) {
    const existing = byId.get(apiRow.id);
    if (
      !existing ||
      updatedAtMs(apiRow.updatedAt) > updatedAtMs(existing.updatedAt)
    ) {
      byId.set(apiRow.id, apiRow);
    }
  }
  return [...byId.values()];
}
