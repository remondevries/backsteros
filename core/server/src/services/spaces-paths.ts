/**
 * Spaces path / category helpers — shared by move, heal, and the Spaces API.
 * Paths are vault-relative under Spaces/ (no leading "Spaces/").
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

export const SPACES_CATEGORY_IDS = [
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
] as const;

export type SpacesCategoryId = (typeof SPACES_CATEGORY_IDS)[number];

export const SPACES_CATEGORY_TITLES: Record<SpacesCategoryId, string> = {
  [SPACES_CATEGORY_KNOWLEDGE_BASE]: "Knowledge Base",
  [SPACES_CATEGORY_SUPPORT]: "Support center",
  [SPACES_CATEGORY_WEBSITES]: "Websites",
};

export function normalizeSpacesPath(
  path: string | null | undefined,
): string {
  return (path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
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

export function isSpacesCategoryId(
  value: string | null | undefined,
): value is SpacesCategoryId {
  return (
    value === SPACES_CATEGORY_KNOWLEDGE_BASE ||
    value === SPACES_CATEGORY_SUPPORT ||
    value === SPACES_CATEGORY_WEBSITES
  );
}

export function resolveSpacesCategoryIdFromPath(
  path: string | null | undefined,
): SpacesCategoryId | null {
  const normalized = normalizeSpacesPath(path);
  for (const id of SPACES_CATEGORY_IDS) {
    if (normalized === id || normalized.startsWith(`${id}/`)) {
      return id;
    }
  }
  return null;
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
