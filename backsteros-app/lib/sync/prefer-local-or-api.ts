/**
 * Prefer PowerSync rows when present; fall back to API when local is empty.
 * Empty synced tables used to block API data via `local ?? api` because `[]` is not nullish.
 */
export function preferLocalOrApi<T>(
  localRows: T[] | null | undefined,
  apiRows: T[] | null | undefined,
): T[] {
  if (localRows != null && localRows.length > 0) return localRows;
  if (apiRows != null && apiRows.length > 0) return apiRows;
  return localRows ?? apiRows ?? [];
}

/** Resolve one entity from either source (local may be empty or incomplete). */
export function findLocalOrApi<T>(
  localRows: T[] | null | undefined,
  apiRows: T[] | null | undefined,
  match: (row: T) => boolean,
): T | null {
  return (
    localRows?.find(match) ?? apiRows?.find(match) ?? null
  );
}
