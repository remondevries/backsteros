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
 * Keep optimistic rows that a fresh REST snapshot has not caught up with yet
 * (create → hydrate race used to wipe a just-created letter from the side list).
 */
export function preservePendingApiRows<T extends { id: string }>(
  previous: T[] | null | undefined,
  incoming: T[],
): T[] {
  if (!previous?.length) return incoming;
  const incomingIds = new Set(incoming.map((row) => row.id));
  const pending = previous.filter((row) => !incomingIds.has(row.id));
  if (pending.length === 0) return incoming;
  return [...pending, ...incoming];
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

/**
 * Prefer API `moneybirdContactId` when local is missing it, or when the API
 * row is at least as new (stale PowerSync schema often omits the column).
 */
export function fillMissingMoneybirdContactIdFromApi<
  T extends {
    id: string;
    moneybirdContactId?: string | null;
    updatedAt?: string | number | Date | null;
  },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    const localId =
      typeof row.moneybirdContactId === "string"
        ? row.moneybirdContactId.trim()
        : "";
    const apiId =
      typeof api.moneybirdContactId === "string"
        ? api.moneybirdContactId.trim()
        : "";
    if (!apiId && !localId) return row;
    if (localId === apiId) return row;
    if (!localId && apiId) {
      return { ...row, moneybirdContactId: api.moneybirdContactId };
    }
    if (
      apiId &&
      updatedAtMs(api.updatedAt) >= updatedAtMs(row.updatedAt)
    ) {
      return { ...row, moneybirdContactId: api.moneybirdContactId };
    }
    return row;
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

/**
 * PowerSync can keep habit-day rows after the server soft-deletes them
 * (`deleted_at IS NULL` sync query). REST is the membership snapshot — drop
 * local-only habit tasks so today's chips don't double up.
 */
export function dropStaleLocalHabitTasks<
  T extends { id: string; habitId?: string | null },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (apiRows == null || apiRows.length === 0) return mergedRows;
  const apiIds = new Set(apiRows.map((row) => row.id));
  return mergedRows.filter((row) => {
    if (row.habitId == null || String(row.habitId).trim() === "") return true;
    return apiIds.has(row.id);
  });
}

function dueDateMissing(value: unknown): boolean {
  return value == null || value === "";
}

/**
 * When local omits `dueDate` / `dueEndDate` (stale PowerSync schema / failed
 * local patch), copy scheduling fields from the API row so calendar drops
 * survive navigation.
 */
export function fillMissingDueDatesFromApi<
  T extends {
    id: string;
    dueDate?: string | null;
    dueEndDate?: string | null;
    updatedAt?: string | number | Date | null;
  },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    const apiHasDue = !dueDateMissing(api.dueDate);
    const localHasDue = !dueDateMissing(row.dueDate);
    if (!apiHasDue) return row;
    if (!localHasDue) {
      return {
        ...row,
        dueDate: api.dueDate,
        dueEndDate: api.dueEndDate ?? row.dueEndDate ?? null,
      };
    }
    if (
      updatedAtMs(api.updatedAt) > updatedAtMs(row.updatedAt) &&
      (api.dueDate !== row.dueDate || api.dueEndDate !== row.dueEndDate)
    ) {
      return {
        ...row,
        dueDate: api.dueDate,
        dueEndDate: api.dueEndDate ?? null,
      };
    }
    return row;
  });
}

function attendeeIdsMissing(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]") return true;
    try {
      const parsed = JSON.parse(trimmed);
      return !Array.isArray(parsed) || parsed.length === 0;
    } catch {
      return true;
    }
  }
  return true;
}

/**
 * When local omits meeting property columns (stale PowerSync schema / failed
 * local patch), copy project, organization, and attendees from the API row.
 */
export function fillMissingMeetingPropertiesFromApi<
  T extends {
    id: string;
    projectId?: string | null;
    organizationId?: string | null;
    attendeeContactIds?: unknown;
    updatedAt?: string | number | Date | null;
  },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    let next = row;

    const localProject =
      typeof row.projectId === "string" ? row.projectId.trim() : "";
    const apiProject =
      typeof api.projectId === "string" ? api.projectId.trim() : "";
    if (!localProject && apiProject) {
      next = { ...next, projectId: api.projectId };
    } else if (
      apiProject &&
      apiProject !== localProject &&
      updatedAtMs(api.updatedAt) >= updatedAtMs(row.updatedAt)
    ) {
      next = { ...next, projectId: api.projectId };
    } else if (
      !apiProject &&
      localProject &&
      updatedAtMs(api.updatedAt) > updatedAtMs(row.updatedAt)
    ) {
      next = { ...next, projectId: api.projectId };
    }

    const localOrg =
      typeof row.organizationId === "string" ? row.organizationId.trim() : "";
    const apiOrg =
      typeof api.organizationId === "string" ? api.organizationId.trim() : "";
    if (!localOrg && apiOrg) {
      next = { ...next, organizationId: api.organizationId };
    } else if (
      apiOrg !== localOrg &&
      updatedAtMs(api.updatedAt) >= updatedAtMs(row.updatedAt)
    ) {
      next = { ...next, organizationId: api.organizationId };
    }

    if (attendeeIdsMissing(row.attendeeContactIds)) {
      if (!attendeeIdsMissing(api.attendeeContactIds)) {
        next = { ...next, attendeeContactIds: api.attendeeContactIds };
      }
    } else if (
      !attendeeIdsMissing(api.attendeeContactIds) &&
      updatedAtMs(api.updatedAt) > updatedAtMs(row.updatedAt)
    ) {
      next = { ...next, attendeeContactIds: api.attendeeContactIds };
    }

    return next;
  });
}

/** Copy `habitId` from API when local/PowerSync omitted the column. */
export function fillMissingHabitIdFromApi<
  T extends { id: string; habitId?: string | null },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    if (row.habitId != null && String(row.habitId).trim() !== "") {
      return row;
    }
    const api = apiById.get(row.id);
    if (!api?.habitId) return row;
    return { ...row, habitId: api.habitId };
  });
}
