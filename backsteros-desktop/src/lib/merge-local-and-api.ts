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

function linksMissing(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "[]";
  }
  return false;
}

function hasLinks(value: unknown): boolean {
  return !linksMissing(value);
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

/**
 * When local wins by updatedAt but still omits `links` (stale schema / sync),
 * copy non-empty links from the API row — matches web `findLocalOrApi`.
 */
export function fillMissingLinksFromApi<
  T extends { id: string; links?: unknown },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    if (!linksMissing(row.links)) return row;
    const api = apiById.get(row.id);
    if (!api || !hasLinks(api.links)) return row;
    return { ...row, links: api.links };
  });
}

function typeMissing(value: unknown): boolean {
  return value == null || value === "";
}

/**
 * When local omits `type`, copy it from the API row so desktop project lists
 * can subgroup by type (Codebase, IT Service, …).
 */
export function fillMissingTypeFromApi<
  T extends { id: string; type?: string | null },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    if (!typeMissing(row.type)) return row;
    const api = apiById.get(row.id);
    if (!api || typeMissing(api.type)) return row;
    return { ...row, type: api.type };
  });
}
