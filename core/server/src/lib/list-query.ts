/**
 * Shared list-query parsing for GET collection endpoints (OS-59).
 *
 * Mirrors OS-28/OS-45 task-list rules: strict known keys, enum validation,
 * `limit` (default 50 / max 200), opaque keyset cursor on `(updatedAt desc, id)`,
 * and `paginated=true` for `{ items, nextCursor }` (legacy array shape otherwise).
 */

import {
  DOCUMENT_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TASK_STATUSES,
} from "@backsteros/contracts";

import { DOCUMENT_SEMANTIC_TYPE_OPTIONS } from "./document-core-property-schema.js";

export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;
export const LIST_CURSOR_TTL_MS = 10 * 60 * 1000;
/** Default when GET /documents omits `limit` (OS-59). */
export const DOCUMENTS_DEFAULT_LIMIT = 100;
export const GLOBAL_SEARCH_DEFAULT_LIMIT = 20;
export const GLOBAL_SEARCH_MAX_LIMIT = 100;
/** Default / max for `GET /api/v1/search` (documents + tasks). */
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

export const GLOBAL_SEARCH_MODES = [
  "all",
  "projects",
  "tasks",
  "documents",
  "letters",
  "knowledge",
  "contacts",
  "organizations",
] as const;

export type GlobalSearchMode = (typeof GLOBAL_SEARCH_MODES)[number];

const STATUS_SET = new Set<string>(TASK_STATUSES);
const PROJECT_STATUS_SET = new Set<string>(PROJECT_STATUSES);
const PROJECT_TYPE_SET = new Set<string>(PROJECT_TYPES);
const DOCUMENT_TYPE_SET = new Set<string>([
  ...DOCUMENT_TYPES,
  ...DOCUMENT_SEMANTIC_TYPE_OPTIONS,
]);
const GLOBAL_SEARCH_MODE_SET = new Set<string>(GLOBAL_SEARCH_MODES);

export class ListQueryError extends Error {
  readonly field: string;
  readonly code: "bad_request" | "cursor_expired";

  constructor(
    message: string,
    field: string,
    code: "bad_request" | "cursor_expired" = "bad_request",
  ) {
    super(message);
    this.name = "ListQueryError";
    this.field = field;
    this.code = code;
  }
}

export type UpdatedAtCursorPayload = {
  v: 1;
  issuedAt: number;
  updatedAt: string;
  id: string;
};

export type ListPagination = {
  mode: "legacy" | "paginated";
  limit: number;
  cursor?: string;
  updatedSince?: Date;
};

/** Flatten repeated + comma-separated query values. */
export function parseMultiValues(
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

export function firstString(
  raw: string | string[] | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "" ? undefined : value;
}

export function collectQueryParams(
  url: URL,
): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    const all = url.searchParams.getAll(key);
    raw[key] = all.length <= 1 ? (all[0] ?? "") : all;
  }
  return raw;
}

export function parseOptionalBoolean(
  raw: string | string[] | undefined | null,
  field: string,
): boolean | undefined {
  if (raw == null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new ListQueryError(`Invalid boolean for ${field}`, field);
}

export function parseListLimit(
  raw: string | string[] | undefined | null,
  options: { defaultLimit?: number; maxLimit?: number; field?: string } = {},
): number {
  const defaultLimit = options.defaultLimit ?? LIST_DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? LIST_MAX_LIMIT;
  const field = options.field ?? "limit";
  if (raw == null || raw === "") return defaultLimit;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > maxLimit) {
    throw new ListQueryError(
      `limit must be an integer between 1 and ${maxLimit}`,
      field,
    );
  }
  return n;
}

export function parseDateValue(raw: string, field: string): Date {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ListQueryError(`Invalid date for ${field}`, field);
  }
  const iso =
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new ListQueryError(`Invalid date for ${field}: ${raw}`, field);
  }
  return date;
}

export function assertKnownQueryKeys(
  keys: Iterable<string>,
  known: ReadonlySet<string>,
): void {
  for (const key of keys) {
    if (!known.has(key)) {
      throw new ListQueryError(
        `Unknown filter field: ${key}. Allowed: ${[...known].join(", ")}`,
        key,
      );
    }
  }
}

export function shouldUsePaginatedList(input: {
  cursor?: string;
  paginatedFlag: boolean;
}): boolean {
  return Boolean(input.paginatedFlag || input.cursor?.trim());
}

export function ignoredLegacyListKeys(
  raw: Record<string, string | string[] | undefined>,
  paginatedOnlyKeys: readonly string[],
): string[] {
  return paginatedOnlyKeys.filter((key) => {
    const value = raw[key];
    if (value == null) return false;
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
}

export function encodeUpdatedAtCursor(
  row: { updatedAt: Date | string; id: string },
  nowMs: number = Date.now(),
): string {
  const updatedAt =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : new Date(row.updatedAt).toISOString();
  const payload: UpdatedAtCursorPayload = {
    v: 1,
    issuedAt: nowMs,
    updatedAt,
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeUpdatedAtCursor(
  cursor: string,
  nowMs: number = Date.now(),
): UpdatedAtCursorPayload {
  let payload: UpdatedAtCursorPayload;
  try {
    payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as UpdatedAtCursorPayload;
  } catch {
    throw new ListQueryError("Invalid cursor", "cursor");
  }
  if (
    payload?.v !== 1 ||
    typeof payload.issuedAt !== "number" ||
    typeof payload.updatedAt !== "string" ||
    typeof payload.id !== "string"
  ) {
    throw new ListQueryError("Invalid cursor", "cursor");
  }
  if (nowMs - payload.issuedAt > LIST_CURSOR_TTL_MS) {
    throw new ListQueryError(
      "Cursor expired; re-query from the start",
      "cursor",
      "cursor_expired",
    );
  }
  const updatedAt = new Date(payload.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new ListQueryError("Invalid cursor", "cursor");
  }
  return payload;
}

function parseCommonPagination(
  raw: Record<string, string | string[] | undefined>,
  options: { defaultLimit?: number } = {},
): ListPagination {
  const paginatedFlag =
    parseOptionalBoolean(raw.paginated, "paginated") === true;
  const cursor = firstString(raw.cursor);
  const mode = shouldUsePaginatedList({ cursor, paginatedFlag })
    ? "paginated"
    : "legacy";
  const updatedSinceRaw = firstString(raw.updatedSince);
  return {
    mode,
    limit:
      mode === "paginated"
        ? parseListLimit(raw.limit, { defaultLimit: options.defaultLimit })
        : LIST_DEFAULT_LIMIT,
    cursor,
    updatedSince:
      updatedSinceRaw != null
        ? parseDateValue(updatedSinceRaw, "updatedSince")
        : undefined,
  };
}

function assertEnumValues(
  values: string[],
  allowed: ReadonlySet<string>,
  field: string,
): void {
  for (const value of values) {
    if (!allowed.has(value)) {
      throw new ListQueryError(`Invalid ${field}: ${value}`, field);
    }
  }
}

// --- Meetings ----------------------------------------------------------------

export const MEETINGS_LIST_KNOWN_KEYS = new Set([
  "projectId",
  "organizationId",
  "contactId",
  "status",
  "from",
  "to",
  "q",
  "cursor",
  "limit",
  "paginated",
  "updatedSince",
]);

export const MEETINGS_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "updatedSince",
] as const;

export type ParsedMeetingsListQuery = ListPagination & {
  projectId?: string;
  organizationId?: string;
  contactId?: string;
  statuses: string[];
  from?: Date;
  to?: Date;
  q?: string;
};

export function parseMeetingsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedMeetingsListQuery {
  assertKnownQueryKeys(Object.keys(raw), MEETINGS_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  const statuses = parseMultiValues(raw.status);
  assertEnumValues(statuses, STATUS_SET, "status");
  const fromRaw = firstString(raw.from);
  const toRaw = firstString(raw.to);
  const from = fromRaw != null ? parseDateValue(fromRaw, "from") : undefined;
  const to = toRaw != null ? parseDateValue(toRaw, "to") : undefined;
  if (from && to && to.getTime() < from.getTime()) {
    throw new ListQueryError("`to` must be >= `from`", "to");
  }
  return {
    ...pagination,
    projectId: firstString(raw.projectId),
    organizationId: firstString(raw.organizationId),
    contactId: firstString(raw.contactId),
    statuses,
    from,
    to,
    q: firstString(raw.q)?.trim() || undefined,
  };
}

// --- Contacts ----------------------------------------------------------------

export const CONTACTS_LIST_KNOWN_KEYS = new Set([
  "organizationId",
  "q",
  "search",
  "cursor",
  "limit",
  "paginated",
  "updatedSince",
]);

export const CONTACTS_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "updatedSince",
] as const;

export type ParsedContactsListQuery = ListPagination & {
  organizationId?: string;
  q?: string;
};

export function parseContactsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedContactsListQuery {
  assertKnownQueryKeys(Object.keys(raw), CONTACTS_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  return {
    ...pagination,
    organizationId: firstString(raw.organizationId),
    q: (firstString(raw.q) ?? firstString(raw.search))?.trim() || undefined,
  };
}

// --- Organizations -----------------------------------------------------------

export const ORGANIZATIONS_LIST_KNOWN_KEYS = new Set([
  "q",
  "search",
  "cursor",
  "limit",
  "paginated",
  "updatedSince",
]);

export const ORGANIZATIONS_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "updatedSince",
] as const;

export type ParsedOrganizationsListQuery = ListPagination & {
  q?: string;
};

export function parseOrganizationsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedOrganizationsListQuery {
  assertKnownQueryKeys(Object.keys(raw), ORGANIZATIONS_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  return {
    ...pagination,
    q: (firstString(raw.q) ?? firstString(raw.search))?.trim() || undefined,
  };
}

// --- Letters -----------------------------------------------------------------

export const LETTERS_LIST_KNOWN_KEYS = new Set([
  "projectId",
  "organizationId",
  "contactId",
  "status",
  "triage",
  "cursor",
  "limit",
  "paginated",
  "updatedSince",
]);

export const LETTERS_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "updatedSince",
] as const;

export type ParsedLettersListQuery = ListPagination & {
  projectId?: string;
  organizationId?: string;
  contactId?: string;
  status?: string;
  triage?: boolean;
};

export function parseLettersListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedLettersListQuery {
  assertKnownQueryKeys(Object.keys(raw), LETTERS_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  const status = firstString(raw.status);
  if (status != null) assertEnumValues([status], STATUS_SET, "status");
  return {
    ...pagination,
    projectId: firstString(raw.projectId),
    organizationId: firstString(raw.organizationId),
    contactId: firstString(raw.contactId),
    status,
    triage: parseOptionalBoolean(raw.triage, "triage"),
  };
}

// --- Projects ----------------------------------------------------------------

export const PROJECTS_LIST_KNOWN_KEYS = new Set([
  "organizationId",
  "area",
  "status",
  "type",
  "cursor",
  "limit",
  "paginated",
  "updatedSince",
]);

export const PROJECTS_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "updatedSince",
] as const;

export type ParsedProjectsListQuery = ListPagination & {
  organizationId?: string;
  area?: string;
  status?: string;
  type?: string;
};

export function parseProjectsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedProjectsListQuery {
  assertKnownQueryKeys(Object.keys(raw), PROJECTS_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  const status = firstString(raw.status);
  const type = firstString(raw.type);
  if (status != null) {
    assertEnumValues([status], PROJECT_STATUS_SET, "status");
  }
  if (type != null) {
    assertEnumValues([type], PROJECT_TYPE_SET, "type");
  }
  return {
    ...pagination,
    organizationId: firstString(raw.organizationId),
    area: firstString(raw.area),
    status,
    type,
  };
}

// --- Documents (list defaults; type validation) ------------------------------

export const DOCUMENTS_LIST_KNOWN_KEYS = new Set([
  "type",
  "projectId",
  "audience",
  "status",
  "limit",
  "offset",
  "cursor",
  "paginated",
  "updatedSince",
]);

export function assertDocumentListTypeValue(value: string): void {
  if (!DOCUMENT_TYPE_SET.has(value)) {
    throw new ListQueryError(`Invalid type: ${value}`, "type");
  }
}

export function parseDocumentsListLimit(
  raw: string | string[] | undefined | null,
): { limit: number; appliedDefault: boolean } {
  if (raw == null || raw === "") {
    return { limit: DOCUMENTS_DEFAULT_LIMIT, appliedDefault: true };
  }
  return {
    limit: parseListLimit(raw, {
      defaultLimit: DOCUMENTS_DEFAULT_LIMIT,
      maxLimit: LIST_MAX_LIMIT,
    }),
    appliedDefault: false,
  };
}

// --- Email messages ----------------------------------------------------------

export const EMAIL_MESSAGES_LIST_KNOWN_KEYS = new Set([
  "status",
  "cursor",
  "limit",
  "paginated",
  "updatedSince",
]);

export const EMAIL_MESSAGES_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
  "updatedSince",
] as const;

export type ParsedEmailMessagesListQuery = ListPagination & {
  statuses: string[];
};

export function parseEmailMessagesListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedEmailMessagesListQuery {
  assertKnownQueryKeys(Object.keys(raw), EMAIL_MESSAGES_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  const statuses = parseMultiValues(raw.status);
  assertEnumValues(statuses, STATUS_SET, "status");
  return { ...pagination, statuses };
}

// --- Tasks due ---------------------------------------------------------------

export const DUE_TASKS_LIST_KNOWN_KEYS = new Set([
  "before",
  "cursor",
  "limit",
  "paginated",
]);

export const DUE_TASKS_LIST_PAGINATED_ONLY_KEYS = [
  "cursor",
  "limit",
] as const;

export type ParsedDueTasksListQuery = ListPagination & {
  before: Date;
};

export function parseDueTasksListQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedDueTasksListQuery {
  assertKnownQueryKeys(Object.keys(raw), DUE_TASKS_LIST_KNOWN_KEYS);
  const pagination = parseCommonPagination(raw);
  const beforeRaw = firstString(raw.before);
  const before =
    beforeRaw != null ? parseDateValue(beforeRaw, "before") : new Date();
  // When limit is passed without paginated, still honour it (OS-59: limit was ignored).
  const limitRaw = firstString(raw.limit);
  const limit =
    pagination.mode === "paginated" || limitRaw != null
      ? parseListLimit(raw.limit)
      : Number.POSITIVE_INFINITY;
  return {
    ...pagination,
    limit,
    before,
  };
}

// --- Global search -----------------------------------------------------------

export const GLOBAL_SEARCH_KNOWN_KEYS = new Set([
  "q",
  "limit",
  "mode",
  "contextKind",
  "projectId",
  "projectSection",
  "contactId",
  "contactSection",
  "organizationId",
  "organizationSection",
]);

export type ParsedGlobalSearchQuery = {
  q: string;
  limit: number;
  limitClamped: boolean;
  mode: GlobalSearchMode;
  contextKind?: string;
  projectId?: string;
  projectSection?: string;
  contactId?: string;
  contactSection?: string;
  organizationId?: string;
  organizationSection?: string;
};

export function parseGlobalSearchQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedGlobalSearchQuery {
  assertKnownQueryKeys(Object.keys(raw), GLOBAL_SEARCH_KNOWN_KEYS);
  const q = firstString(raw.q)?.trim();
  if (!q) {
    throw new ListQueryError("Query parameter q is required", "q");
  }
  const modeRaw = firstString(raw.mode) ?? "all";
  if (!GLOBAL_SEARCH_MODE_SET.has(modeRaw)) {
    throw new ListQueryError(`Invalid mode: ${modeRaw}`, "mode");
  }
  const limitRaw = firstString(raw.limit);
  let limit = GLOBAL_SEARCH_DEFAULT_LIMIT;
  let limitClamped = false;
  if (limitRaw != null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) {
      throw new ListQueryError(
        `limit must be an integer between 1 and ${GLOBAL_SEARCH_MAX_LIMIT}`,
        "limit",
      );
    }
    if (n > GLOBAL_SEARCH_MAX_LIMIT) {
      limit = GLOBAL_SEARCH_MAX_LIMIT;
      limitClamped = true;
    } else {
      limit = n;
    }
  }
  return {
    q,
    limit,
    limitClamped,
    mode: modeRaw as GlobalSearchMode,
    contextKind: firstString(raw.contextKind),
    projectId: firstString(raw.projectId),
    projectSection: firstString(raw.projectSection),
    contactId: firstString(raw.contactId),
    contactSection: firstString(raw.contactSection),
    organizationId: firstString(raw.organizationId),
    organizationSection: firstString(raw.organizationSection),
  };
}

// --- Agent search (GET /api/v1/search) — OS-55 --------------------------------

export const SEARCH_KNOWN_KEYS = new Set([
  "q",
  "type",
  "projectId",
  "status",
  "limit",
  "cursor",
  "include",
]);

export const SEARCH_TYPE_VALUES = new Set([
  "project",
  "knowledge",
  "journal",
  "task",
  "tasks",
]);

export type SearchDocumentType = "project" | "knowledge" | "journal";
export type ParsedSearchQuery = {
  q: string;
  /** Normalized: `tasks` → `task`. */
  type?: SearchDocumentType | "task";
  projectId?: string;
  /** Task status filter (only meaningful when type=task). */
  statuses: string[];
  limit: number;
  cursor?: string;
  /** Also merge task hits when searching documents (OS-76). */
  includeTasks: boolean;
};

/**
 * Parse `GET /api/v1/search` query. Unknown `type` → 400 with field `type`
 * (do not silently return empty results).
 */
export function parseSearchQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedSearchQuery {
  assertKnownQueryKeys(Object.keys(raw), SEARCH_KNOWN_KEYS);
  const q = firstString(raw.q)?.trim();
  if (!q) {
    throw new ListQueryError("Query parameter q is required", "q");
  }

  const typeRaw = firstString(raw.type);
  let type: ParsedSearchQuery["type"];
  if (typeRaw != null) {
    if (!SEARCH_TYPE_VALUES.has(typeRaw)) {
      throw new ListQueryError(`Invalid type: ${typeRaw}`, "type");
    }
    type = typeRaw === "tasks" ? "task" : (typeRaw as ParsedSearchQuery["type"]);
  }

  const statuses = parseMultiValues(raw.status);
  if (statuses.length) {
    assertEnumValues(statuses, STATUS_SET, "status");
  }

  const includeRaw = firstString(raw.include);
  let includeTasks = false;
  if (includeRaw != null) {
    if (includeRaw !== "task" && includeRaw !== "tasks") {
      throw new ListQueryError(`Invalid include: ${includeRaw}`, "include");
    }
    if (type === "task") {
      throw new ListQueryError(
        "include is only valid for document search",
        "include",
      );
    }
    includeTasks = true;
  }

  return {
    q,
    type,
    projectId: firstString(raw.projectId),
    statuses,
    limit: parseListLimit(raw.limit, {
      defaultLimit: SEARCH_DEFAULT_LIMIT,
      maxLimit: SEARCH_MAX_LIMIT,
    }),
    cursor: firstString(raw.cursor),
    includeTasks,
  };
}

/**
 * Keyset condition for `ORDER BY updated_at DESC, id ASC`.
 * Returns rows strictly after the cursor in that order.
 */
export function isAfterUpdatedAtCursor(
  row: { updatedAt: Date | string; id: string },
  cursor: UpdatedAtCursorPayload,
): boolean {
  const rowTime = new Date(row.updatedAt).getTime();
  const cursorTime = new Date(cursor.updatedAt).getTime();
  if (rowTime < cursorTime) return true;
  if (rowTime > cursorTime) return false;
  return row.id > cursor.id;
}

/** Slice an in-memory list ordered by updatedAt desc, id asc. */
export function paginateByUpdatedAtId<T extends { id: string; updatedAt: string }>(
  rows: T[],
  options: { limit: number; cursor?: string; nowMs?: number },
): { items: T[]; nextCursor: string | null } {
  const nowMs = options.nowMs ?? Date.now();
  let filtered = rows;
  if (options.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(options.cursor, nowMs);
    filtered = rows.filter((row) => isAfterUpdatedAtCursor(row, cursor));
  }
  const page = filtered.slice(0, options.limit + 1);
  const hasMore = page.length > options.limit;
  const items = hasMore ? page.slice(0, options.limit) : page;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
}
