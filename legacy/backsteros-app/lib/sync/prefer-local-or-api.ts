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
  const local = localRows?.find(match);
  const api = apiRows?.find(match);
  if (!local) return api ?? null;
  if (!api) return local;

  const localMs = updatedAtMs(
    (local as { updatedAt?: string | number | Date | null }).updatedAt,
  );
  const apiMs = updatedAtMs(
    (api as { updatedAt?: string | number | Date | null }).updatedAt,
  );
  // Prefer the newer row so REST patches (e.g. project type) win over stale
  // PowerSync rows that may omit newer columns.
  if (apiMs > localMs) return api;

  const localType = (local as { type?: string | null }).type;
  const apiType = (api as { type?: string | null }).type;
  if ((localType == null || localType === "") && apiType) {
    return { ...local, type: apiType };
  }

  const localLinks = (local as { links?: unknown }).links;
  const apiLinks = (api as { links?: unknown }).links;
  const localLinksMissing =
    localLinks == null ||
    localLinks === "" ||
    (Array.isArray(localLinks) && localLinks.length === 0);
  const apiHasLinks =
    (Array.isArray(apiLinks) && apiLinks.length > 0) ||
    (typeof apiLinks === "string" &&
      apiLinks.trim() !== "" &&
      apiLinks.trim() !== "[]");
  if (localLinksMissing && apiHasLinks) {
    return { ...local, links: apiLinks };
  }

  return local;
}

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
 * Merge PowerSync + API document lists by id.
 * Starts from local rows, then upserts API rows that are missing or newer.
 * Lets `refresh()` after REST create surface docs before the next sync checkpoint.
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
