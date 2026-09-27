/**
 * Parse multi-value document property list/retrieval filters.
 * Accepts comma-separated values and camelCase aliases (houseRule → house-rule).
 */

import {
  DOCUMENT_LIST_MAX_LIMIT,
  DOCUMENT_TYPES,
  type DocumentType,
} from "@backsteros/contracts";

/**
 * Resolve list pagination for GET /documents.
 * - `limit` omitted → undefined (return all; desktop full-list clients)
 * - `limit` set → clamp to 1..DOCUMENT_LIST_MAX_LIMIT
 * - `offset` defaults to 0 when `limit` is set; ignored when unbounded
 */
export function resolveDocumentListPagination(input?: {
  limit?: number;
  offset?: number;
}): { limit?: number; offset?: number } {
  const hasLimit = input?.limit != null && Number.isFinite(input.limit);
  if (!hasLimit) {
    return { limit: undefined, offset: undefined };
  }
  const limit = Math.min(
    Math.max(Math.trunc(input!.limit!), 1),
    DOCUMENT_LIST_MAX_LIMIT,
  );
  const offset =
    input?.offset != null && Number.isFinite(input.offset)
      ? Math.max(0, Math.trunc(input.offset))
      : 0;
  return { limit, offset };
}

/**
 * Apply limit/offset to an already-filtered query builder mock / chain.
 * Production `listDocuments` inlines the same steps for drizzle typing.
 */
export function applyDocumentListPagination(
  query: {
    limit: (n: number) => { offset: (n: number) => unknown };
  },
  pagination?: { limit?: number; offset?: number },
): unknown {
  const { limit, offset } = resolveDocumentListPagination(pagination);
  if (limit == null) return query;
  if (offset != null && offset > 0) {
    return query.limit(limit).offset(offset);
  }
  return query.limit(limit);
}

const DOCUMENT_TYPE_SET = new Set<string>(DOCUMENT_TYPES);

export function camelToKebab(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function normalizePropertyFilterValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("-") || trimmed === trimmed.toLowerCase()) {
    return trimmed;
  }
  return camelToKebab(trimmed);
}

/** Flatten repeated + comma-separated query values. */
export function parseMultiQueryValues(
  raw: string | string[] | undefined | null,
): string[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const entry of list) {
    for (const part of entry.split(",")) {
      const normalized = normalizePropertyFilterValue(part);
      if (normalized) out.push(normalized);
    }
  }
  return [...new Set(out)];
}

/**
 * Multi-value query parse that only trims — no kebab/lowercase.
 * Use for project keys (OS, BDV) stored uppercase in the properties index.
 */
export function parseExactMultiQueryValues(
  raw: string | string[] | undefined | null,
): string[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const entry of list) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return [...new Set(out)];
}

export type ParsedDocumentListTypeFilter =
  | { kind: "documentType"; values: DocumentType[] }
  | { kind: "propertyType"; values: string[] }
  | { kind: "none" }
  | { kind: "mixed"; message: string };

/**
 * `type` on GET /documents is overloaded:
 * - knowledge|project|journal → documents.type (existing clients)
 * - any other value → properties.index type (agents / OS-30)
 * Mixing both families in one request is rejected.
 */
/** Pure match against an in-memory properties index (mirrors list SQL filters). */
export function documentMatchesPropertyFilters(
  properties: Record<string, unknown>,
  filters: {
    propertyType?: string[];
    audience?: string[];
    status?: string[];
    project?: string[];
  },
): boolean {
  const scalar = (key: string): string | null => {
    const value = properties[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  if (filters.propertyType?.length) {
    const value = scalar("type");
    if (!value || !filters.propertyType.includes(value)) return false;
  }
  if (filters.audience?.length) {
    const value = scalar("audience");
    if (!value || !filters.audience.includes(value)) return false;
  }
  if (filters.status?.length) {
    const value = scalar("status");
    if (!value || !filters.status.includes(value)) return false;
  }
  if (filters.project?.length) {
    const value = scalar("project");
    if (!value || !filters.project.includes(value)) return false;
  }
  return true;
}

/** True when the properties index lists the task display key in linkedTasks. */
export function propertiesLinkTask(
  properties: Record<string, unknown>,
  displayKey: string,
): boolean {
  const linked = properties.linkedTasks;
  if (typeof linked === "string") {
    return linked.trim() === displayKey;
  }
  if (!Array.isArray(linked)) return false;
  return linked.some(
    (entry) => typeof entry === "string" && entry.trim() === displayKey,
  );
}

/**
 * Section PUT is read-modify-write: default CAS to the version just read so a
 * concurrent save between read and write returns 409 instead of clobbering.
 * Caller-supplied ifMatchVersion still wins.
 */
export function resolveSectionIfMatchVersion(
  callerIfMatch: number | undefined,
  readContentVersion: number,
): number {
  return callerIfMatch ?? readContentVersion;
}

export function parseDocumentListTypeFilter(
  raw: string | string[] | undefined | null,
): ParsedDocumentListTypeFilter {
  const values = parseMultiQueryValues(raw);
  if (values.length === 0) return { kind: "none" };

  const documentTypes = values.filter((value) => DOCUMENT_TYPE_SET.has(value));
  const propertyTypes = values.filter((value) => !DOCUMENT_TYPE_SET.has(value));

  if (documentTypes.length && propertyTypes.length) {
    return {
      kind: "mixed",
      message:
        "type cannot mix structural values (knowledge|project|journal) with property types",
    };
  }
  if (documentTypes.length) {
    return {
      kind: "documentType",
      values: documentTypes as DocumentType[],
    };
  }
  return { kind: "propertyType", values: propertyTypes };
}
