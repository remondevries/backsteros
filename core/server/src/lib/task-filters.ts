/**
 * Parse GET /api/v1/tasks filter/pagination query params (OS-28, OS-45).
 *
 * Legacy callers keep `{ tasks: [...] }` (full rows, all statuses).
 * The paginated shape `{ items, nextCursor, totalCount? }` is explicit
 * opt-in only: `paginated=true` or a `cursor` (OS-45). Paginated-only params
 * (limit, sort, dueDate, linked*, updatedSince, includeTotalCount) are ignored
 * in legacy mode; the route reports them in an `X-BacksterOS-Hint` header.
 */

import { TASK_STATUSES } from "@backsteros/contracts";

export const TASK_LIST_DEFAULT_LIMIT = 50;
export const TASK_LIST_MAX_LIMIT = 200;
export const TASK_LIST_CURSOR_TTL_MS = 10 * 60 * 1000;
export const TASK_LIST_DEFAULT_SORT = "dueDate" as const;

/** Terminal statuses excluded unless the caller passes them in `status`. */
export const TASK_LIST_DEFAULT_EXCLUDED_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

/** Hint when paginated list hides terminal statuses by default (OS-57). */
export const TASK_LIST_DEFAULT_EXCLUSION_HINT =
  "completed, canceled, duplicated excluded by default; pass status=... to include them";

const STATUS_SET = new Set<string>(TASK_STATUSES);

export const TASK_LIST_KNOWN_QUERY_KEYS = new Set([
  "projectId",
  /** Explicit project key alias (OS-58); merged into projectId refs. */
  "projectKey",
  "status",
  "assigneeId",
  "dueDate",
  "linkedDocuments",
  "contactId",
  "relatedContactId",
  "relatedOrganizationId",
  "linkedTasks",
  "linkedEmails",
  "inbox",
  "support",
  "notification",
  "cursor",
  "limit",
  "sort",
  "includeTotalCount",
  "paginated",
  "updatedSince",
]);

/**
 * Params that only take effect in paginated mode. In legacy mode they are
 * ignored (reported via the hint header so callers notice).
 */
export const TASK_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "sort",
  "includeTotalCount",
  "dueDate",
  "linkedDocuments",
  "linkedTasks",
  "linkedEmails",
  "updatedSince",
] as const;

export type DueDateFilter =
  | { op: "before"; date: Date }
  | { op: "after"; date: Date }
  | { op: "between"; start: Date; end: Date };

export type TaskListCursorPayload = {
  v: 1;
  issuedAt: number;
  /** 0 = has due date, 1 = null due date (sorts last). */
  nullDue: 0 | 1;
  dueDate: string | null;
  createdAt: string;
  id: string;
};

export class TaskFilterError extends Error {
  readonly field: string;
  readonly code: "bad_request" | "cursor_expired";

  constructor(
    message: string,
    field: string,
    code: "bad_request" | "cursor_expired" = "bad_request",
  ) {
    super(message);
    this.name = "TaskFilterError";
    this.field = field;
    this.code = code;
  }
}

/** Flatten repeated + comma-separated query values (ids/status — no case fold). */
export function parseTaskMultiValues(
  raw: string | string[] | undefined | null,
): string[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const entry of list) {
    for (const part of String(entry).split(",")) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return [...new Set(out)];
}

function parseOptionalBoolean(
  raw: string | string[] | undefined | null,
  field: string,
): boolean | undefined {
  if (raw == null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new TaskFilterError(
    `Invalid boolean for ${field}`,
    field,
  );
}

function parseDateValue(raw: string, field: string): Date {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new TaskFilterError(`Invalid date for ${field}`, field);
  }
  // Date-only → UTC midnight so range bounds are stable.
  const iso =
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new TaskFilterError(`Invalid date for ${field}: ${raw}`, field);
  }
  return date;
}

/**
 * dueDate range syntax (single query param value):
 * - before:<iso|YYYY-MM-DD>
 * - after:<iso|YYYY-MM-DD>
 * - between:<start>,<end>
 */
export function parseDueDateFilter(
  raw: string | string[] | undefined | null,
): DueDateFilter | undefined {
  if (raw == null) return undefined;
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value) return undefined;

  const lower = value.toLowerCase();
  if (lower.startsWith("before:")) {
    return {
      op: "before",
      date: parseDateValue(value.slice("before:".length), "dueDate"),
    };
  }
  if (lower.startsWith("after:")) {
    return {
      op: "after",
      date: parseDateValue(value.slice("after:".length), "dueDate"),
    };
  }
  if (lower.startsWith("between:")) {
    const rest = value.slice("between:".length);
    const comma = rest.indexOf(",");
    if (comma < 0) {
      throw new TaskFilterError(
        "dueDate between requires start,end",
        "dueDate",
      );
    }
    const start = parseDateValue(rest.slice(0, comma), "dueDate");
    const end = parseDateValue(rest.slice(comma + 1), "dueDate");
    if (end.getTime() < start.getTime()) {
      throw new TaskFilterError(
        "dueDate between end must be >= start",
        "dueDate",
      );
    }
    return { op: "between", start, end };
  }

  throw new TaskFilterError(
    "dueDate must be before:<date>, after:<date>, or between:<start>,<end>",
    "dueDate",
  );
}

export function parseTaskListLimit(
  raw: string | string[] | undefined | null,
): number {
  if (raw == null || raw === "") return TASK_LIST_DEFAULT_LIMIT;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > TASK_LIST_MAX_LIMIT) {
    throw new TaskFilterError(
      `limit must be an integer between 1 and ${TASK_LIST_MAX_LIMIT}`,
      "limit",
    );
  }
  return n;
}

export function assertKnownTaskListQueryKeys(
  keys: Iterable<string>,
): void {
  for (const key of keys) {
    if (!TASK_LIST_KNOWN_QUERY_KEYS.has(key)) {
      throw new TaskFilterError(
        `Unknown filter field: ${key}. Allowed: ${[...TASK_LIST_KNOWN_QUERY_KEYS].join(", ")}`,
        key,
      );
    }
  }
}

export type ParsedTaskListQuery = {
  mode: "legacy" | "paginated";
  projectIds: string[];
  statuses: string[];
  assigneeIds: string[];
  contactIds: string[];
  relatedContactIds: string[];
  relatedOrganizationIds: string[];
  linkedDocumentIds: string[];
  linkedTaskIds: string[];
  linkedEmailIds: string[];
  dueDate?: DueDateFilter;
  /**
   * Change feed (OS-45): only tasks with updatedAt >= this instant. Also
   * returns soft-deleted tasks (with `deletedAt`) and, unless `status` is
   * given, all statuses (completed/canceled included).
   */
  updatedSince?: Date;
  inbox?: boolean;
  support?: boolean;
  notification?: boolean;
  limit: number;
  cursor?: string;
  includeTotalCount: boolean;
  sort: typeof TASK_LIST_DEFAULT_SORT;
};

/**
 * True when paginated list SQL/matcher applies the default terminal-status
 * exclusion (no `status`, no `updatedSince` change feed).
 */
export function taskListUsesDefaultStatusExclusion(
  filters: Pick<ParsedTaskListQuery, "statuses" | "updatedSince">,
): boolean {
  return filters.statuses.length === 0 && filters.updatedSince == null;
}

/**
 * Expand `status=all` to every known status. Rejects mixing `all` with others.
 */
export function expandTaskListStatuses(rawStatuses: string[]): string[] {
  if (!rawStatuses.length) return [];
  if (rawStatuses.includes("all")) {
    if (rawStatuses.length !== 1) {
      throw new TaskFilterError(
        "status=all cannot be combined with other statuses",
        "status",
      );
    }
    return [...TASK_STATUSES];
  }
  return rawStatuses;
}

function firstString(
  raw: string | string[] | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "" ? undefined : value;
}

/**
 * Decide whether this request should use the paginated response shape.
 *
 * OS-45: explicit opt-in only (`paginated=true` or a cursor). Before OS-45 any
 * limit, sort, dueDate, linked-filter or multi-value param switched the shape, which made
 * legacy callers reading `tasks` silently get nothing.
 */
export function shouldUsePaginatedTaskList(input: {
  cursor?: string;
  paginatedFlag: boolean;
}): boolean {
  return Boolean(input.paginatedFlag || input.cursor?.trim());
}

/** Paginated-only params present on a request (for the legacy-mode hint). */
export function ignoredLegacyTaskListKeys(
  raw: Record<string, string | string[] | undefined>,
): string[] {
  return TASK_LIST_PAGINATED_ONLY_KEYS.filter((key) => {
    const value = raw[key];
    if (value == null) return false;
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
}

export function parseTaskListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedTaskListQuery {
  // OS-58: projectKey is an explicit alias; merged for later id/key resolution.
  const projectIds = [
    ...parseTaskMultiValues(raw.projectId),
    ...parseTaskMultiValues(raw.projectKey),
  ];
  const statusesRaw = parseTaskMultiValues(raw.status);
  const assigneeIds = parseTaskMultiValues(raw.assigneeId);
  const contactIds = parseTaskMultiValues(raw.contactId);
  const relatedContactIds = parseTaskMultiValues(raw.relatedContactId);
  const relatedOrganizationIds = parseTaskMultiValues(
    raw.relatedOrganizationId,
  );
  const linkedDocumentIds = parseTaskMultiValues(raw.linkedDocuments);
  const linkedTaskIds = parseTaskMultiValues(raw.linkedTasks);
  const linkedEmailIds = parseTaskMultiValues(raw.linkedEmails);

  // Validate status values only when present — legacy callers that somehow
  // pass junk keep their prior empty-match behavior unless they opt in.
  const dueDateRaw = firstString(raw.dueDate);
  let dueDate: DueDateFilter | undefined;
  const sortRaw = firstString(raw.sort);

  const paginatedFlag =
    parseOptionalBoolean(raw.paginated, "paginated") === true;
  const includeTotalCount =
    parseOptionalBoolean(raw.includeTotalCount, "includeTotalCount") === true;

  const updatedSinceRaw = firstString(raw.updatedSince);
  let updatedSince: Date | undefined;

  const mode = shouldUsePaginatedTaskList({
    cursor: firstString(raw.cursor),
    paginatedFlag,
  })
    ? "paginated"
    : "legacy";

  let statuses = statusesRaw;
  if (mode === "paginated") {
    assertKnownTaskListQueryKeys(Object.keys(raw));
    // OS-57: status=all → every known status (before per-value validation).
    statuses = expandTaskListStatuses(statusesRaw);
    for (const status of statuses) {
      if (!STATUS_SET.has(status)) {
        throw new TaskFilterError(`Invalid status: ${status}`, "status");
      }
    }
    if (dueDateRaw != null) {
      dueDate = parseDueDateFilter(dueDateRaw);
    }
    if (updatedSinceRaw != null) {
      updatedSince = parseDateValue(updatedSinceRaw, "updatedSince");
    }
    if (sortRaw != null && sortRaw !== TASK_LIST_DEFAULT_SORT) {
      throw new TaskFilterError(
        `Unsupported sort: ${sortRaw}. Only dueDate is supported`,
        "sort",
      );
    }
  }

  return {
    mode,
    projectIds,
    statuses,
    assigneeIds,
    contactIds,
    relatedContactIds,
    relatedOrganizationIds,
    linkedDocumentIds,
    linkedTaskIds,
    linkedEmailIds,
    dueDate,
    updatedSince,
    inbox: parseOptionalBoolean(raw.inbox, "inbox"),
    support: parseOptionalBoolean(raw.support, "support"),
    notification: parseOptionalBoolean(raw.notification, "notification"),
    limit:
      mode === "paginated"
        ? parseTaskListLimit(raw.limit)
        : TASK_LIST_DEFAULT_LIMIT,
    cursor: firstString(raw.cursor),
    includeTotalCount,
    sort: TASK_LIST_DEFAULT_SORT,
  };
}

export function encodeTaskListCursor(
  row: {
    dueDate: Date | null;
    createdAt: Date;
    id: string;
  },
  nowMs: number = Date.now(),
): string {
  const payload: TaskListCursorPayload = {
    v: 1,
    issuedAt: nowMs,
    nullDue: row.dueDate == null ? 1 : 0,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeTaskListCursor(
  cursor: string,
  nowMs: number = Date.now(),
): TaskListCursorPayload {
  let payload: TaskListCursorPayload;
  try {
    payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as TaskListCursorPayload;
  } catch {
    throw new TaskFilterError("Invalid cursor", "cursor");
  }
  if (
    payload?.v !== 1 ||
    typeof payload.issuedAt !== "number" ||
    (payload.nullDue !== 0 && payload.nullDue !== 1) ||
    typeof payload.createdAt !== "string" ||
    typeof payload.id !== "string" ||
    (payload.dueDate != null && typeof payload.dueDate !== "string")
  ) {
    throw new TaskFilterError("Invalid cursor", "cursor");
  }
  if (nowMs - payload.issuedAt > TASK_LIST_CURSOR_TTL_MS) {
    throw new TaskFilterError(
      "Cursor expired; re-query from the start",
      "cursor",
      "cursor_expired",
    );
  }
  const createdAt = new Date(payload.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new TaskFilterError("Invalid cursor", "cursor");
  }
  if (payload.dueDate != null) {
    const due = new Date(payload.dueDate);
    if (Number.isNaN(due.getTime())) {
      throw new TaskFilterError("Invalid cursor", "cursor");
    }
  }
  return payload;
}

/**
 * Human display key: PROJECT-number, or INBOX-number when no project.
 * Project segment: letter then alphanumerics (case-insensitive).
 */
export const TASK_DISPLAY_KEY_RE = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

export type ParsedTaskDisplayKey = {
  projectKey: string;
  number: number;
};

export function parseTaskDisplayKey(
  ref: string,
): ParsedTaskDisplayKey | null {
  const match = ref.trim().match(TASK_DISPLAY_KEY_RE);
  if (!match) return null;
  return {
    projectKey: match[1]!.toUpperCase(),
    number: Number(match[2]),
  };
}

/** Human display key: PROJECT-number, or INBOX-number when no project. */
export function formatTaskDisplayKey(
  projectKey: string | null | undefined,
  number: number,
): string {
  const key = projectKey?.trim() || "INBOX";
  return `${key}-${number}`;
}

/**
 * Pure AND/OR match helper for unit tests (mirrors SQL filter semantics
 * for scalar fields; link filters are SQL-only).
 */
export function taskRowMatchesScalarFilters(
  row: {
    projectId: string | null;
    status: string;
    assigneeId: string | null;
    contactId: string | null;
    relatedContactIds: string[];
    dueDate: Date | null;
  },
  filters: Pick<
    ParsedTaskListQuery,
    | "projectIds"
    | "statuses"
    | "assigneeIds"
    | "contactIds"
    | "relatedContactIds"
    | "dueDate"
  >,
): boolean {
  if (filters.projectIds.length && !filters.projectIds.includes(row.projectId ?? "")) {
    return false;
  }
  if (filters.statuses.length) {
    if (!filters.statuses.includes(row.status)) return false;
  } else if (
    (TASK_LIST_DEFAULT_EXCLUDED_STATUSES as readonly string[]).includes(
      row.status,
    )
  ) {
    return false;
  }
  if (
    filters.assigneeIds.length &&
    !filters.assigneeIds.includes(row.assigneeId ?? "")
  ) {
    return false;
  }
  if (
    filters.contactIds.length &&
    !filters.contactIds.includes(row.contactId ?? "")
  ) {
    return false;
  }
  if (filters.relatedContactIds.length) {
    const hit = filters.relatedContactIds.some((id) =>
      row.relatedContactIds.includes(id),
    );
    if (!hit) return false;
  }
  if (filters.dueDate) {
    if (!row.dueDate) return false;
    const t = row.dueDate.getTime();
    if (filters.dueDate.op === "before" && !(t < filters.dueDate.date.getTime())) {
      return false;
    }
    if (filters.dueDate.op === "after" && !(t > filters.dueDate.date.getTime())) {
      return false;
    }
    if (filters.dueDate.op === "between") {
      if (
        t < filters.dueDate.start.getTime() ||
        t > filters.dueDate.end.getTime()
      ) {
        return false;
      }
    }
  }
  return true;
}
