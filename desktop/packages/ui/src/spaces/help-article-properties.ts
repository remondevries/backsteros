/**
 * Help Center article properties (Support center Spaces docs).
 * Extensible model — add fields here as portal/publish metadata grows.
 *
 * Audience is chosen via the side-panel Group / Individual list toggle,
 * not a property dropdown on the article.
 *
 * Individual articles stay in their own list and optionally point at a
 * Group folder (“Appears in”) so the portal can nest them under that
 * public section without mixing authoring trees.
 */

import { HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG } from "./help-article-individual-folder.js";
import { normalizeSpacesDocumentPath } from "./spaces-categories.js";

export const HELP_ARTICLE_AUDIENCE_GROUP = "group" as const;
export const HELP_ARTICLE_AUDIENCE_INDIVIDUAL = "individual" as const;

/** @deprecated Use {@link HELP_ARTICLE_AUDIENCE_GROUP}. */
export const HELP_ARTICLE_AUDIENCE_EVERYONE = HELP_ARTICLE_AUDIENCE_GROUP;
/** @deprecated Use {@link HELP_ARTICLE_AUDIENCE_INDIVIDUAL}. */
export const HELP_ARTICLE_AUDIENCE_CLIENT = HELP_ARTICLE_AUDIENCE_INDIVIDUAL;

export type HelpArticleAudience =
  | typeof HELP_ARTICLE_AUDIENCE_GROUP
  | typeof HELP_ARTICLE_AUDIENCE_INDIVIDUAL;

export const HELP_ARTICLE_AUDIENCE_ORDER: readonly HelpArticleAudience[] = [
  HELP_ARTICLE_AUDIENCE_GROUP,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
] as const;

export const HELP_ARTICLE_LIST_SCOPE_OPTIONS: ReadonlyArray<{
  value: HelpArticleAudience;
  label: string;
}> = [
  { value: HELP_ARTICLE_AUDIENCE_GROUP, label: "Group" },
  { value: HELP_ARTICLE_AUDIENCE_INDIVIDUAL, label: "Individual" },
] as const;

/** Publish lifecycle for Group and Individual support articles. */
export const HELP_ARTICLE_STATUSES = [
  "concept",
  "published",
  "offline",
] as const;

export type HelpArticleStatus = (typeof HELP_ARTICLE_STATUSES)[number];

export const HELP_ARTICLE_STATUS_LABELS: Record<HelpArticleStatus, string> = {
  concept: "Concept",
  published: "Published",
  offline: "Offline",
};

export const HELP_ARTICLE_STATUS_ORDER: readonly HelpArticleStatus[] = [
  ...HELP_ARTICLE_STATUSES,
];

export const HELP_ARTICLE_STATUS_DEFAULT: HelpArticleStatus = "concept";

export type HelpArticleProperties = {
  id: string;
  /** Group (everyone) vs Individual (per-contact) list membership. */
  audience: HelpArticleAudience;
  /** Concept / published / offline — applies to both audiences. */
  status: HelpArticleStatus;
  /** Portal / public SEO title (may differ from the document title). */
  seoTitle: string;
  /** Meta description for search / social previews. */
  seoDescription: string;
  /** Public URL slug when published. */
  slug: string;
  /**
   * When audience is `individual`, portal contacts this article is scoped to
   * (one or more — same multi-select pattern as meeting attendees).
   */
  contactIds: string[];
  /**
   * When audience is `individual`, the Group (public) folder this article
   * should appear under in the portal — e.g. “Email setup”.
   */
  placementFolderId?: string | null;
  placementFolderTitle?: string | null;
  placementFolderPath?: string | null;
};

export function getHelpArticleAudienceLabel(
  audience: HelpArticleAudience,
): string {
  switch (audience) {
    case HELP_ARTICLE_AUDIENCE_INDIVIDUAL:
      return "Individual";
    case HELP_ARTICLE_AUDIENCE_GROUP:
    default:
      return "Group";
  }
}

export function isHelpArticleStatus(value: string): value is HelpArticleStatus {
  return (HELP_ARTICLE_STATUSES as readonly string[]).includes(value);
}

export function getHelpArticleStatusLabel(status: HelpArticleStatus): string {
  return HELP_ARTICLE_STATUS_LABELS[status];
}

export function normalizeHelpArticleStatus(
  value: string | null | undefined,
): HelpArticleStatus {
  if (typeof value !== "string") return HELP_ARTICLE_STATUS_DEFAULT;
  // Migrate early scaffold keys.
  if (value === "draft") return "concept";
  if (value === "archived") return "offline";
  if (isHelpArticleStatus(value)) return value;
  return HELP_ARTICLE_STATUS_DEFAULT;
}

export function createDefaultHelpArticleProperties(
  id: string,
  audience: HelpArticleAudience = HELP_ARTICLE_AUDIENCE_GROUP,
): HelpArticleProperties {
  return {
    id,
    audience,
    status: HELP_ARTICLE_STATUS_DEFAULT,
    seoTitle: "",
    seoDescription: "",
    slug: "",
    contactIds: [],
    placementFolderId: null,
    placementFolderTitle: null,
    placementFolderPath: null,
  };
}

export function normalizeHelpArticleAudience(
  value: string | null | undefined,
): HelpArticleAudience {
  if (
    value === HELP_ARTICLE_AUDIENCE_INDIVIDUAL ||
    value === "client" // legacy scaffold key
  ) {
    return HELP_ARTICLE_AUDIENCE_INDIVIDUAL;
  }
  return HELP_ARTICLE_AUDIENCE_GROUP;
}

function normalizeContactIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function normalizeSeoText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Single path segment → lowercase kebab; empty when nothing usable remains. */
export function normalizeHelpArticleSlugLeaf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Full public slug path (`folder/article`). Segments are kebab-cased; empty
 * segments are dropped.
 */
export function normalizeHelpArticleSlug(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .split("/")
    .map((segment) => normalizeHelpArticleSlugLeaf(segment))
    .filter(Boolean)
    .join("/");
}

/**
 * Folder path relative to the Support space root → slug prefix with trailing
 * slash (e.g. `email-setup/`). Omits the space root and `_individual`.
 */
export function resolveHelpArticleSlugPrefix(options: {
  folderPath?: string | null;
  spaceRootPath?: string | null;
}): string {
  const folder = normalizeSpacesDocumentPath(options.folderPath);
  if (!folder) return "";

  let relative = folder;
  const root = normalizeSpacesDocumentPath(options.spaceRootPath);
  if (root) {
    if (relative === root) return "";
    if (relative.startsWith(`${root}/`)) {
      relative = relative.slice(root.length + 1);
    }
  }

  const individualSlug = HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG;
  if (relative === individualSlug) return "";
  if (relative.startsWith(`${individualSlug}/`)) {
    relative = relative.slice(individualSlug.length + 1);
  }

  const segments = relative
    .split("/")
    .map((segment) => normalizeHelpArticleSlugLeaf(segment))
    .filter(Boolean);
  return segments.length > 0 ? `${segments.join("/")}/` : "";
}

/** Editable leaf from a stored slug given the current folder prefix. */
export function helpArticleSlugLeaf(slug: string, prefix: string): string {
  const full = normalizeHelpArticleSlug(slug);
  if (!full) return "";
  if (prefix && full.startsWith(prefix)) return full.slice(prefix.length);
  if (full.includes("/")) return full.split("/").pop() ?? full;
  return full;
}

/** Compose folder prefix + leaf into the stored public slug. */
export function composeHelpArticleSlug(prefix: string, leaf: string): string {
  const leafNorm = normalizeHelpArticleSlugLeaf(leaf);
  if (!leafNorm) return "";
  return `${prefix}${leafNorm}`;
}

/** Keep the leaf, replace the folder prefix (e.g. after a move). */
export function rewriteHelpArticleSlugPrefix(
  slug: string,
  nextPrefix: string,
): string {
  const full = normalizeHelpArticleSlug(slug);
  if (!full) return "";
  const leaf = full.includes("/") ? (full.split("/").pop() ?? full) : full;
  return composeHelpArticleSlug(nextPrefix, leaf);
}

export type HelpArticleSeoDetails = Pick<
  HelpArticleProperties,
  "seoTitle" | "seoDescription" | "slug"
>;

export function normalizeHelpArticleProperties(
  partial: Partial<HelpArticleProperties> & { id: string },
): HelpArticleProperties {
  const audience = normalizeHelpArticleAudience(partial.audience);
  const base = createDefaultHelpArticleProperties(partial.id, audience);
  const isIndividual = audience === HELP_ARTICLE_AUDIENCE_INDIVIDUAL;
  return {
    ...base,
    ...partial,
    audience,
    status: normalizeHelpArticleStatus(partial.status),
    seoTitle: normalizeSeoText(partial.seoTitle).trim(),
    seoDescription: normalizeSeoText(partial.seoDescription).trim(),
    slug: normalizeHelpArticleSlug(partial.slug),
    contactIds: isIndividual ? normalizeContactIds(partial.contactIds) : [],
    placementFolderId: isIndividual
      ? (partial.placementFolderId ?? null)
      : null,
    placementFolderTitle: isIndividual
      ? (partial.placementFolderTitle ?? null)
      : null,
    placementFolderPath: isIndividual
      ? (partial.placementFolderPath ?? null)
      : null,
  };
}
