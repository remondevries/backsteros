/**
 * Spaces path / category helpers — shared by move, heal, and the Spaces API.
 * Paths are vault-relative under Spaces/ (no leading "Spaces/").
 *
 * Categories are root knowledge folders (parentId null). The three defaults
 * below are still seeded by ensureSpacesHierarchy; additional categories are
 * created via POST /api/v1/spaces/categories and discovered from documents.
 */

import {
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
  SPACES_SECOND_BRAIN_RELATIVE,
} from "../lib/storage.js";

export {
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
  SPACES_SECOND_BRAIN_RELATIVE,
};

/** Seeded default category path slugs (still ensured on heal). */
export const SPACES_DEFAULT_CATEGORY_IDS = [
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
] as const;

/** @deprecated Prefer SPACES_DEFAULT_CATEGORY_IDS — categories are dynamic. */
export const SPACES_CATEGORY_IDS = SPACES_DEFAULT_CATEGORY_IDS;

/** Category id = root folder path slug (e.g. knowledge-base, support, …). */
export type SpacesCategoryId = string;

export const SPACES_DEFAULT_CATEGORY_TITLES: Record<
  (typeof SPACES_DEFAULT_CATEGORY_IDS)[number],
  string
> = {
  [SPACES_CATEGORY_KNOWLEDGE_BASE]: "Knowledge Base",
  [SPACES_CATEGORY_SUPPORT]: "Support center",
  [SPACES_CATEGORY_WEBSITES]: "Websites",
};

/** @deprecated Prefer SPACES_DEFAULT_CATEGORY_TITLES. */
export const SPACES_CATEGORY_TITLES = SPACES_DEFAULT_CATEGORY_TITLES;

export function normalizeSpacesPath(
  path: string | null | undefined,
): string {
  return (path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * True when value is a single kebab-case path segment suitable as a
 * Spaces category root path (not nested).
 */
export function isSpacesCategoryPathSlug(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const normalized = normalizeSpacesPath(value);
  if (!normalized || normalized.includes("/")) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized);
}

/**
 * @deprecated Structural slug check only — prefer resolving against live
 * category roots from the workspace. Kept for callers that still gate on shape.
 */
export function isSpacesCategoryId(
  value: string | null | undefined,
): value is SpacesCategoryId {
  return isSpacesCategoryPathSlug(value);
}

export function spacesPathLeaf(
  path: string | null | undefined,
  title?: string | null,
): string {
  const normalized = normalizeSpacesPath(path);
  if (normalized) {
    const parts = normalized.split("/");
    return parts[parts.length - 1]!;
  }
  const slug = (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

/**
 * Category id from a document path = first path segment.
 * Optional `knownRoots` restricts to an explicit root set (defaults only, or
 * live category paths from the workspace). Without it, any first segment wins.
 */
export function resolveSpacesCategoryIdFromPath(
  path: string | null | undefined,
  knownRoots?: readonly string[],
): SpacesCategoryId | null {
  const normalized = normalizeSpacesPath(path);
  if (!normalized) return null;
  const first = normalized.split("/")[0]!;
  if (knownRoots) {
    const roots = new Set(
      knownRoots.map((root) => normalizeSpacesPath(root)).filter(Boolean),
    );
    return roots.has(first) ? first : null;
  }
  return first;
}

/** Expected document path given parent folder path + this node's leaf slug. */
export function expectedChildSpacesPath(
  parentPath: string | null | undefined,
  leaf: string,
): string {
  const parent = normalizeSpacesPath(parentPath);
  const segment = normalizeSpacesPath(leaf);
  if (!segment) return parent;
  if (!parent) return segment;
  return `${parent}/${segment}`;
}

/**
 * Rewrite a path when its ancestor prefix changes
 * (e.g. portal → support/portal, portal/email → support/portal/email).
 */
export function rewritePathUnderPrefix(
  path: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  const normalized = normalizeSpacesPath(path);
  const from = normalizeSpacesPath(oldPrefix);
  const to = normalizeSpacesPath(newPrefix);
  if (!from) return normalized;
  if (normalized === from) return to;
  if (normalized.startsWith(`${from}/`)) {
    return `${to}${normalized.slice(from.length)}`;
  }
  return normalized;
}

export function isSecondBrainRelativePath(
  path: string | null | undefined,
): boolean {
  const normalized = normalizeSpacesPath(path);
  return (
    normalized === SPACES_SECOND_BRAIN_RELATIVE ||
    normalized.startsWith(`${SPACES_SECOND_BRAIN_RELATIVE}/`)
  );
}

/** True when a knowledge row looks like the Portal space under Second brain. */
export function isMisplacedPortalUnderSecondBrain(input: {
  title: string;
  path: string;
  parentPath: string | null | undefined;
}): boolean {
  const parent = normalizeSpacesPath(input.parentPath);
  if (parent !== SPACES_SECOND_BRAIN_RELATIVE) return false;
  const path = normalizeSpacesPath(input.path);
  const title = input.title.trim().toLowerCase();
  return path === "portal" || title === "portal";
}
