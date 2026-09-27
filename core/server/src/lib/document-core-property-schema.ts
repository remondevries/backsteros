/**
 * Core document property schema (phase 1). Per-project extras arrive in phase 3.
 *
 * Spaces publish already uses front-matter `status` (concept|published|offline)
 * and `audience` (group|individual). Content indexing must preserve those
 * legacy values; the properties panel uses the core enums below.
 */
export const DOCUMENT_PROPERTY_MIRROR_KEYS = [
  "project",
  "audience",
] as const;

/** Semantic document classification (front matter `type`). Not documents.type. */
export const DOCUMENT_SEMANTIC_TYPE_OPTIONS = [
  "reference",
  "runbook",
  "house-rule",
  "meeting-notes",
  "decision",
  "letter",
  "draft",
] as const;

export const DOCUMENT_AUDIENCE_OPTIONS = [
  "agents",
  "remon",
  "client",
  "public",
] as const;

/** Spaces publish audience values that may already exist in front matter. */
export const DOCUMENT_LEGACY_AUDIENCE_OPTIONS = ["group", "individual"] as const;

export const DOCUMENT_STATUS_OPTIONS = [
  "draft",
  "current",
  "superseded",
  "archived",
] as const;

/** Spaces publish status values that may already exist in front matter. */
export const DOCUMENT_LEGACY_STATUS_OPTIONS = [
  "concept",
  "published",
  "offline",
] as const;

export type DocumentSemanticType =
  (typeof DOCUMENT_SEMANTIC_TYPE_OPTIONS)[number];
export type DocumentPropertyAudience =
  (typeof DOCUMENT_AUDIENCE_OPTIONS)[number];
export type DocumentPropertyStatus =
  (typeof DOCUMENT_STATUS_OPTIONS)[number];

export type DocumentPropertiesIndex = Record<string, unknown>;

/** Local cores that forward writes must not mint DOC-n (leader owns the counter). */
export function shouldAllocateDocKeyLocally(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CORE_REPLICATION_ROLE !== "local";
}

export function formatDocKey(number: number): string {
  return `DOC-${number}`;
}

export function parseDocKeyNumber(docKey: string): number | null {
  const match = docKey.trim().match(/^DOC-(\d+)$/i);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * @param strict when true, unknown values are rejected; when false, preserved.
 */
export function coerceDocumentPropertyEnum(
  key: string,
  value: unknown,
  allowed: readonly string[],
  strict: boolean,
): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    if (strict) {
      throw new Error(`INVALID_PROPERTY:${key}`);
    }
    return null;
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (allowed.includes(normalized)) return normalized;
  if (!strict) return normalized;
  throw new Error(`INVALID_PROPERTY:${key}`);
}

export const CORE_DOCUMENT_PROPERTY_KEYS = [
  "project",
  "type",
  "audience",
  "status",
  "supersededBy",
  "owner",
  "reviewDate",
  "linkedTasks",
  "linkedContacts",
] as const;

export function buildPropertiesIndex(
  frontMatter: Record<string, unknown>,
): DocumentPropertiesIndex {
  const index: DocumentPropertiesIndex = {};
  for (const [key, value] of Object.entries(frontMatter)) {
    if (value == null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      index[key] = trimmed;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      index[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const list = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
        .filter((entry) => entry != null && entry !== "");
      if (list.length) index[key] = list;
    }
  }
  return index;
}

/**
 * Mirror project + audience from DB fields into front matter.
 * Preserves property-audience values client/public/agents when the DB only
 * stores Spaces `group` (lossless mapping is impossible for those).
 */
export function mirrorValuesFromRow(input: {
  audience: string;
  projectKey: string | null;
  existingAudience?: unknown;
}): Record<string, unknown> {
  const mirrors: Record<string, unknown> = {
    project: input.projectKey,
  };
  if (input.audience === "individual") {
    mirrors.audience = "remon";
  } else {
    const existing =
      typeof input.existingAudience === "string"
        ? input.existingAudience.trim()
        : "";
    if (
      existing === "client" ||
      existing === "public" ||
      existing === "agents" ||
      existing === "remon"
    ) {
      mirrors.audience = existing;
    } else {
      mirrors.audience = "agents";
    }
  }
  return mirrors;
}

export function applyMirrorFrontMatter(
  row: { audience: string },
  frontMatter: Record<string, unknown>,
  projectKey: string | null,
): Record<string, unknown> {
  return mergeFrontMatterRecord(
    frontMatter,
    mirrorValuesFromRow({
      audience: row.audience,
      projectKey,
      existingAudience: frontMatter.audience,
    }),
  );
}

function mergeFrontMatterRecord(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}
