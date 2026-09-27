/**
 * Core document property schema (phase 1). Per-project extras arrive in phase 3.
 */
export const DOCUMENT_PROPERTY_MIRROR_KEYS = [
  "project",
  "audience",
] as const;

/** Semantic document classification (front matter `type`). Not documents.type (knowledge/journal/project). */
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

export const DOCUMENT_STATUS_OPTIONS = [
  "draft",
  "current",
  "superseded",
  "archived",
] as const;

export type DocumentSemanticType =
  (typeof DOCUMENT_SEMANTIC_TYPE_OPTIONS)[number];
export type DocumentPropertyAudience =
  (typeof DOCUMENT_AUDIENCE_OPTIONS)[number];
export type DocumentPropertyStatus =
  (typeof DOCUMENT_STATUS_OPTIONS)[number];

export type DocumentPropertiesIndex = Record<string, unknown>;

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

export function mirrorValuesFromRow(input: {
  audience: string;
  projectKey: string | null;
}): Record<string, unknown> {
  const mirrors: Record<string, unknown> = {
    project: input.projectKey,
    audience: input.audience === "individual" ? "remon" : "agents",
  };
  return mirrors;
}

export function applyMirrorFrontMatter(
  row: { audience: string },
  frontMatter: Record<string, unknown>,
  projectKey: string | null,
): Record<string, unknown> {
  return mergeFrontMatterRecord(
    frontMatter,
    mirrorValuesFromRow({ audience: row.audience, projectKey }),
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
