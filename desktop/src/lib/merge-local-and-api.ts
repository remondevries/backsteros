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

function textMissing(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/**
 * When local wins by updatedAt but still omits codebase binding fields
 * (stale PowerSync schema / sync), copy them from the API row so repo and
 * working directory survive restart.
 */
export function fillMissingCodebaseFieldsFromApi<
  T extends {
    id: string;
    githubRepository?: string | null;
    localWorkingDirectory?: string | null;
  },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    let next = row;
    if (
      textMissing(row.githubRepository) &&
      !textMissing(api.githubRepository)
    ) {
      next = { ...next, githubRepository: api.githubRepository };
    }
    if (
      textMissing(row.localWorkingDirectory) &&
      !textMissing(api.localWorkingDirectory)
    ) {
      next = { ...next, localWorkingDirectory: api.localWorkingDirectory };
    }
    return next;
  });
}

/**
 * When local omits `parent` (stale PowerSync schema / sync), copy it from the
 * API row so nested areas group under Personal / Business / Clients.
 */
export function fillMissingParentFromApi<
  T extends { id: string; parent?: string | null },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    if (!typeMissing(row.parent)) return row;
    const api = apiById.get(row.id);
    if (!api || typeMissing(api.parent)) return row;
    return { ...row, parent: api.parent };
  });
}

/**
 * When local omits `agentChatId` (stale PowerSync schema / sync), copy it from
 * the API row so Start→Stop agent binding survives after navigation.
 */
export function fillMissingAgentChatIdFromApi<
  T extends { id: string; agentChatId?: string | null },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    if (row.agentChatId != null && String(row.agentChatId).trim() !== "") {
      return row;
    }
    const api = apiById.get(row.id);
    if (!api) return row;
    const apiChat =
      api.agentChatId != null ? String(api.agentChatId).trim() : "";
    if (!apiChat) return row;
    return { ...row, agentChatId: api.agentChatId };
  });
}
