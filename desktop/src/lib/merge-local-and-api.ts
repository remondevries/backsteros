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
 * When the same task appears in list + inbox snapshots, keep the newer row so
 * due dates (and other fields) stay consistent across side panel and detail.
 */
export function preferNewerByUpdatedAt<
  T extends { updatedAt?: string | number | Date | null },
>(current: T, incoming: T): T {
  return updatedAtMs(incoming.updatedAt) >= updatedAtMs(current.updatedAt)
    ? incoming
    : current;
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
 * Resolve list rows for the Linear-shaped client.
 * Once SQLite/PowerSync has rows, keep that membership — REST is only a
 * cold-start rescue when local is empty.
 *
 * Still overlay an API row when its `updatedAt` is newer. Optimistic patches
 * bump the API cache immediately while the SQLite watch is still a tick
 * behind; without this, a re-render snaps status (and other fields) back to
 * the stale local value until PowerSync catches up — or forever if sync
 * briefly re-delivers the pre-patch row.
 */
export function resolveLocalOrApiRows<
  T extends { id: string; updatedAt?: string | number | Date | null },
>(
  localRows: T[] | null | undefined,
  apiRows: T[] | null | undefined,
): T[] {
  if (localRows != null && localRows.length > 0) {
    if (!apiRows?.length) return localRows;
    const apiById = new Map(apiRows.map((row) => [row.id, row]));
    return localRows.map((local) => {
      const api = apiById.get(local.id);
      if (!api) return local;
      return preferNewerByUpdatedAt(local, api);
    });
  }
  return apiRows ?? localRows ?? [];
}

/**
 * Keep optimistic API creates that SQLite has not mirrored yet.
 * {@link resolveLocalOrApiRows} drops them once any local rows exist, which
 * made just-created tasks flash "Not found" on detail until the watch caught up.
 */
export function mergeLocalWithPendingApiCreates<T extends { id: string }>(
  localRows: T[],
  apiRows: T[] | null | undefined,
): T[] {
  if (!apiRows?.length) return localRows;
  const localIds = new Set(localRows.map((row) => row.id));
  const pending = apiRows.filter((row) => !localIds.has(row.id));
  if (pending.length === 0) return localRows;
  return [...pending, ...localRows];
}

/**
 * Documents live path: overlay newer API metadata (move/rename/title) and
 * pending creates onto SQLite rows until PowerSync catches up. Optional
 * `deletedIds` hides agent deletes immediately.
 *
 * Scoped to documents only — do not generalize to tasks/projects (Linear-shaped
 * local-primary lists).
 */
export function mergeLocalDocumentsWithLiveApi<
  T extends { id: string; updatedAt?: string | number | Date | null },
>(
  localRows: T[],
  apiRows: T[] | null | undefined,
  options?: { deletedIds?: ReadonlySet<string> },
): T[] {
  const deletedIds = options?.deletedIds;
  const base =
    deletedIds && deletedIds.size > 0
      ? localRows.filter((row) => !deletedIds.has(row.id))
      : localRows;

  if (!apiRows?.length) return base;

  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  const merged = base.map((local) => {
    if (deletedIds?.has(local.id)) return local;
    const api = apiById.get(local.id);
    if (!api) return local;
    if (updatedAtMs(api.updatedAt) > updatedAtMs(local.updatedAt)) {
      return api;
    }
    return local;
  });

  const localIds = new Set(merged.map((row) => row.id));
  const pending = apiRows.filter(
    (row) => !localIds.has(row.id) && !deletedIds?.has(row.id),
  );
  if (pending.length === 0) return merged;
  return [...pending, ...merged];
}

/**
 * Column fillers for fields that PowerSync list watches already select
 * (links, type, due dates, …) must only run on cold-start rescue (local
 * empty). Once SQLite has rows, pass null so those fillers are no-ops.
 *
 * Do **not** gate {@link fillMissingLongTextFromApi} with this for entities
 * that still merge list-omitted long text from REST (projects, letters, …).
 * Task **description** is not list-filled — detail opens fetch on demand.
 */
export function apiFillSourceForColdStart<T>(
  localRows: T[] | null | undefined,
  apiRows: T[] | null | undefined,
): T[] | null | undefined {
  if (localRows != null && localRows.length > 0) return null;
  return apiRows;
}

/**
 * @deprecated Prefer {@link resolveLocalOrApiRows}. Kept for tests covering
 * the legacy dual-hydrate wall-clock merge while that path is retired.
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

function optionalTextMissing(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/**
 * When list watches omit long-text columns (description / summary / context /
 * notes / transcription), copy non-empty values from the API row.
 */
export function fillMissingLongTextFromApi<T extends { id: string }>(
  mergedRows: T[],
  apiRows: T[] | null | undefined,
  fields: readonly (keyof T & string)[],
): T[] {
  if (!apiRows?.length || fields.length === 0) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    let next: T | null = null;
    for (const field of fields) {
      if (!optionalTextMissing(row[field])) continue;
      const apiValue = api[field];
      if (optionalTextMissing(apiValue)) continue;
      if (!next) next = { ...row };
      (next as Record<string, unknown>)[field] = apiValue;
    }
    return next ?? row;
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
 * When local omits `linkedCommitShas` (CLI/API write before PowerSync pull, or
 * schema lag), copy them from the API row so task Changes stay visible.
 * When the API row is newer (optimistic unlink/link), prefer API — including
 * an empty list — so clears are not resurrected from stale SQLite.
 */
export function fillMissingLinkedCommitShasFromApi<
  T extends {
    id: string;
    linkedCommitShas?: string[] | null;
    updatedAt?: string | number | Date | null;
  },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    const local = Array.isArray(row.linkedCommitShas)
      ? row.linkedCommitShas.filter(
          (sha): sha is string =>
            typeof sha === "string" && sha.trim().length > 0,
        )
      : [];
    const apiShas = Array.isArray(api.linkedCommitShas)
      ? api.linkedCommitShas.filter(
          (sha): sha is string =>
            typeof sha === "string" && sha.trim().length > 0,
        )
      : [];
    if (updatedAtMs(api.updatedAt) > updatedAtMs(row.updatedAt)) {
      if (
        local.length === apiShas.length &&
        local.every(
          (sha, index) => sha.toLowerCase() === apiShas[index]?.toLowerCase(),
        )
      ) {
        return row;
      }
      return { ...row, linkedCommitShas: api.linkedCommitShas ?? [] };
    }
    if (local.length > 0) return row;
    if (apiShas.length === 0) return row;
    return { ...row, linkedCommitShas: api.linkedCommitShas };
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
    format?: string | null;
    locationOrganizationId?: string | null;
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

    const localFormat =
      typeof row.format === "string" ? row.format.trim() : "";
    const apiFormat =
      typeof api.format === "string" ? api.format.trim() : "";
    if (!localFormat && apiFormat) {
      next = { ...next, format: api.format };
    } else if (
      apiFormat &&
      apiFormat !== localFormat &&
      updatedAtMs(api.updatedAt) >= updatedAtMs(row.updatedAt)
    ) {
      next = { ...next, format: api.format };
    }

    const localLocationOrg =
      typeof row.locationOrganizationId === "string"
        ? row.locationOrganizationId.trim()
        : "";
    const apiLocationOrg =
      typeof api.locationOrganizationId === "string"
        ? api.locationOrganizationId.trim()
        : "";
    if (!localLocationOrg && apiLocationOrg) {
      next = { ...next, locationOrganizationId: api.locationOrganizationId };
    } else if (
      api.locationOrganizationId !== undefined &&
      apiLocationOrg !== localLocationOrg &&
      updatedAtMs(api.updatedAt) >= updatedAtMs(row.updatedAt)
    ) {
      next = { ...next, locationOrganizationId: api.locationOrganizationId };
    }

    return next;
  });
}

/**
 * Agent inbox approval is monotonic — once set locally or via REST, keep it
 * when PowerSync download briefly omits the column before upload catches up.
 */
export function fillMissingAgentInboxApprovedAtFromApi<
  T extends {
    id: string;
    agentInboxApprovedAt?: string | null;
  },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    if (!optionalTextMissing(row.agentInboxApprovedAt)) return row;
    const api = apiById.get(row.id);
    if (!api || optionalTextMissing(api.agentInboxApprovedAt)) return row;
    return { ...row, agentInboxApprovedAt: api.agentInboxApprovedAt };
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

function entityNumberMissing(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "number" && (!Number.isFinite(value) || value <= 0))
  );
}

/**
 * Server assigns `number` on create / scope move. Local PowerSync rows often
 * keep `null` (or a stale inbox number after a project move) until download.
 * Prefer the API number when local is missing, or when both rows share the
 * same project scope but disagree on the number.
 */
export function fillMissingNumberFromApi<
  T extends { id: string; number?: number | null; projectId?: string | null },
>(mergedRows: T[], apiRows: T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api || entityNumberMissing(api.number)) return row;
    if (entityNumberMissing(row.number)) {
      return { ...row, number: api.number };
    }
    if (
      row.number !== api.number &&
      (row.projectId ?? null) === (api.projectId ?? null)
    ) {
      return { ...row, number: api.number };
    }
    return row;
  });
}
