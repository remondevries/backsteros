import type { KnowledgeListItem } from "../navigation/entity-routes.js";
import {
  getSelectedKnowledgeSlugFromPathname,
  isKnowledgeSectionPath,
  SPACES_APP_PATH,
  SPACES_APP_PATH_LEGACY,
} from "../navigation/entity-routes.js";
import { isHelpArticleIndividualRootFolder } from "./help-article-individual-folder.js";

/** Document path slugs — must match core `SPACES_CATEGORY_*` constants. */
export const SPACES_CATEGORY_KNOWLEDGE_BASE = "knowledge-base";
export const SPACES_CATEGORY_SUPPORT = "support";
export const SPACES_CATEGORY_WEBSITES = "websites";
export const SPACES_SECOND_BRAIN_RELATIVE = "knowledge-base/second-brain";

/** Normalize a Spaces document path for category / prefix checks. */
export function normalizeSpacesDocumentPath(
  path: string | null | undefined,
): string {
  return (path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * True when the document lives under the Support center category
 * (`support` or `support/…`).
 */
export function isSupportCenterDocumentPath(
  path: string | null | undefined,
): boolean {
  const normalized = normalizeSpacesDocumentPath(path);
  return (
    normalized === SPACES_CATEGORY_SUPPORT ||
    normalized.startsWith(`${SPACES_CATEGORY_SUPPORT}/`)
  );
}

/**
 * True when the document lives under the Websites category
 * (`websites` or `websites/…`).
 */
export function isWebsiteDocumentPath(
  path: string | null | undefined,
): boolean {
  const normalized = normalizeSpacesDocumentPath(path);
  return (
    normalized === SPACES_CATEGORY_WEBSITES ||
    normalized.startsWith(`${SPACES_CATEGORY_WEBSITES}/`)
  );
}

/**
 * Resolve which Spaces category a document/folder belongs to.
 * Prefers path prefixes, then walks parentId to a category root folder
 * (covers legacy/local folders whose path omitted the category slug).
 */
export function resolveSpacesCategoryId(
  doc: KnowledgeListItem | null | undefined,
  documents: readonly KnowledgeListItem[],
): SpacesCategoryId | null {
  if (!doc) return null;

  const path = normalizeSpacesDocumentPath(doc.path);
  for (const category of SPACES_CATEGORIES) {
    if (
      path === category.rootPath ||
      path.startsWith(`${category.rootPath}/`)
    ) {
      return category.id;
    }
  }

  const byId = new Map(documents.map((item) => [item.id, item]));
  const categoryByRootPath = new Map(
    SPACES_CATEGORIES.map((category) => [category.rootPath, category.id]),
  );
  let current: KnowledgeListItem | null = doc;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const currentPath = normalizeSpacesDocumentPath(current.path);
    const fromPath = categoryByRootPath.get(currentPath);
    if (fromPath) return fromPath;
    if (!current.parentId) break;
    current = byId.get(current.parentId) ?? null;
  }
  return null;
}

export type SpacesCategoryId =
  | "knowledge-base"
  | "support"
  | "websites";

export type SpacesCategory = {
  id: SpacesCategoryId;
  /** Overview group header (ProjectTypeGroupSection title). */
  title: string;
  /** Root folder document path under Spaces. */
  rootPath: string;
  /** When true, overview group shows + to create a child folder. */
  allowCreate: boolean;
};

export const SPACES_CATEGORIES: readonly SpacesCategory[] = [
  {
    id: "knowledge-base",
    title: "Knowledge Base",
    rootPath: SPACES_CATEGORY_KNOWLEDGE_BASE,
    allowCreate: true,
  },
  {
    id: "support",
    title: "Support center",
    rootPath: SPACES_CATEGORY_SUPPORT,
    allowCreate: true,
  },
  {
    id: "websites",
    title: "Websites",
    rootPath: SPACES_CATEGORY_WEBSITES,
    allowCreate: true,
  },
] as const;

export function isSpacesOverviewPath(pathname: string): boolean {
  return (
    pathname === SPACES_APP_PATH ||
    pathname === `${SPACES_APP_PATH}/` ||
    pathname === SPACES_APP_PATH_LEGACY ||
    pathname === `${SPACES_APP_PATH_LEGACY}/`
  );
}

export function findKnowledgeFolderByPath(
  documents: readonly KnowledgeListItem[],
  path: string,
): KnowledgeListItem | null {
  return (
    documents.find(
      (doc) => doc.kind === "folder" && (doc.path ?? "") === path,
    ) ?? null
  );
}

/** Direct child folders of a category root (Second brain, support categories, sites). */
export function listSpaceChildFolders(
  documents: readonly KnowledgeListItem[],
  categoryRootPath: string,
): KnowledgeListItem[] {
  const root = findKnowledgeFolderByPath(documents, categoryRootPath);
  if (!root) return [];
  return documents
    .filter(
      (doc) =>
        doc.kind === "folder" &&
        doc.parentId === root.id &&
        doc.id !== root.id &&
        // Support center: hide reserved Individual system folder from overview.
        !(
          categoryRootPath === SPACES_CATEGORY_SUPPORT &&
          isHelpArticleIndividualRootFolder(doc)
        ),
    )
    .slice()
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.title.localeCompare(b.title);
    });
}

/**
 * Total article (document) count under a space folder, including nested folders.
 * Folders themselves are not counted.
 */
export function countArticlesInFolder(
  documents: readonly KnowledgeListItem[],
  folderId: string,
): number {
  const descendantIds = collectDescendantIds(documents, folderId);
  let count = 0;
  for (const doc of documents) {
    if (descendantIds.has(doc.id) && doc.kind !== "folder") {
      count += 1;
    }
  }
  return count;
}

/**
 * Newest `updatedAt` among the folder and all descendants (articles + folders).
 */
export function latestUpdatedAtInFolder(
  documents: readonly KnowledgeListItem[],
  folderId: string,
): number | null {
  const root = documents.find((doc) => doc.id === folderId) ?? null;
  let latest = root?.updatedAt ?? null;
  const descendantIds = collectDescendantIds(documents, folderId);
  for (const doc of documents) {
    if (!descendantIds.has(doc.id)) continue;
    const at = doc.updatedAt ?? null;
    if (at == null) continue;
    if (latest == null || at > latest) latest = at;
  }
  return latest;
}

/** Relative / short label for a space “last updated” badge. */
export function formatSpaceUpdatedLabel(
  updatedAt: number | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return null;
  const deltaSec = Math.round((nowMs - updatedAt) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const WEEK_MS = 7 * 86_400_000;

/** Freshness for the Spaces last-updated calendar icon. */
export type SpaceUpdatedFreshness = "fresh" | "stale" | "stale_long";

/**
 * - &lt; 1 week → fresh (gray)
 * - ≥ 1 week → stale (orange)
 * - ≥ 2 weeks → stale_long (red)
 */
export function resolveSpaceUpdatedFreshness(
  updatedAt: number | null | undefined,
  nowMs: number = Date.now(),
): SpaceUpdatedFreshness | null {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return null;
  const ageMs = nowMs - updatedAt;
  if (ageMs >= 2 * WEEK_MS) return "stale_long";
  if (ageMs >= WEEK_MS) return "stale";
  return "fresh";
}

/** Well-known space paths → default octicon keys (overridable via folder.icon). */
const SPACE_PATH_ICON_KEYS: Readonly<Record<string, string>> = {
  [SPACES_SECOND_BRAIN_RELATIVE]: "second-brain",
};

const CATEGORY_DEFAULT_ICON_KEYS: Readonly<
  Record<SpacesCategoryId, string>
> = {
  "knowledge-base": "book",
  support: "comment-discussion",
  websites: "globe",
};

/**
 * Icon key for a space overview row. Prefers a stored folder icon, then a
 * well-known path (e.g. Second brain), then the category default.
 */
export function resolveSpaceOverviewIconKey(input: {
  path?: string | null;
  icon?: string | null;
  categoryId: SpacesCategoryId;
}): string {
  const stored = input.icon?.trim();
  if (stored) return stored;
  const path = (input.path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (path && SPACE_PATH_ICON_KEYS[path]) {
    return SPACE_PATH_ICON_KEYS[path]!;
  }
  return CATEGORY_DEFAULT_ICON_KEYS[input.categoryId];
}

/** Well-known space paths → overview card descriptions (until DB field lands). */
const SPACE_PATH_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [SPACES_SECOND_BRAIN_RELATIVE]:
    "Personal notes, ideas, and lasting knowledge.",
};

const CATEGORY_DEFAULT_DESCRIPTIONS: Readonly<
  Record<SpacesCategoryId, string>
> = {
  "knowledge-base": "Browse and organize knowledge in this space.",
  support: "Help articles and support content for this category.",
  websites: "Pages and content for this website.",
};

/**
 * Description for a space overview card. Prefers a stored folder description,
 * then a well-known path default, then a category fallback.
 */
export function resolveSpaceOverviewDescription(input: {
  path?: string | null;
  description?: string | null;
  categoryId: SpacesCategoryId;
}): string {
  const stored = input.description?.trim();
  if (stored) return stored;
  const path = (input.path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (path && SPACE_PATH_DESCRIPTIONS[path]) {
    return SPACE_PATH_DESCRIPTIONS[path]!;
  }
  return CATEGORY_DEFAULT_DESCRIPTIONS[input.categoryId];
}

/** Soft accent used for the card icon glow (category-tinted). */
export function resolveSpaceOverviewAccent(
  categoryId: SpacesCategoryId,
): string {
  switch (categoryId) {
    case "support":
      return "#60a5fa";
    case "websites":
      return "#34d399";
    case "knowledge-base":
    default:
      return "#fbbf24";
  }
}

function collectDescendantIds(
  documents: readonly KnowledgeListItem[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string | null, KnowledgeListItem[]>();
  for (const doc of documents) {
    const parentKey = doc.parentId ?? null;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(doc);
    childrenByParent.set(parentKey, list);
  }
  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenByParent.get(current) ?? [];
    for (const child of children) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

/**
 * Documents/folders inside a space root (excludes the root folder itself).
 * Used for the scoped knowledge tree side panel.
 * Direct children of the space root are re-parented to `null` so the tree
 * builds without the category/space folder row.
 */
export function filterDocumentsForSpaceRoot(
  documents: readonly KnowledgeListItem[],
  rootFolderId: string,
): KnowledgeListItem[] {
  const descendantIds = collectDescendantIds(documents, rootFolderId);
  return documents
    .filter((doc) => descendantIds.has(doc.id))
    .map((doc) =>
      doc.parentId === rootFolderId ? { ...doc, parentId: null } : doc,
    );
}

/**
 * Resolve which space folder the current `/spaces/…` route is under.
 * Prefers the longest matching folder path prefix, then falls back to
 * walking parentId from the selected document.
 */
export function getSelectedSpaceRootFromPathname(
  pathname: string,
  documents: readonly KnowledgeListItem[],
): KnowledgeListItem | null {
  if (isSpacesOverviewPath(pathname)) return null;
  const slug = getSelectedKnowledgeSlugFromPathname(pathname);
  if (!slug) return null;

  const folders = documents.filter((doc) => doc.kind === "folder");
  const categoryRoots = new Set(
    SPACES_CATEGORIES.map((category) => category.rootPath),
  );

  // Exact folder match first.
  const exact = folders.find((folder) => (folder.path ?? "") === slug);
  if (exact) {
    if (categoryRoots.has(exact.path ?? "")) {
      // Category roots are not drill-in spaces — stay on overview conceptually.
      return null;
    }
    return exact;
  }

  // Longest path prefix among space child folders (and deeper folders).
  let best: KnowledgeListItem | null = null;
  let bestLen = -1;
  for (const folder of folders) {
    const path = folder.path ?? "";
    if (!path || categoryRoots.has(path)) continue;
    if (slug === path || slug.startsWith(`${path}/`)) {
      if (path.length > bestLen) {
        best = folder;
        bestLen = path.length;
      }
    }
  }
  if (best) {
    // Walk up to the direct child of a category root (the space entry).
    return resolveSpaceEntryFolder(best, documents, categoryRoots);
  }

  // Selected document: walk parentId to space entry.
  const selected =
    documents.find(
      (doc) =>
        doc.id === slug ||
        doc.path === slug ||
        doc.path === decodeURIComponent(slug),
    ) ?? null;
  if (!selected) return null;
  return resolveSpaceEntryFromDocument(selected, documents, categoryRoots);
}

function resolveSpaceEntryFolder(
  folder: KnowledgeListItem,
  documents: readonly KnowledgeListItem[],
  categoryRoots: Set<string>,
): KnowledgeListItem {
  let current: KnowledgeListItem | null = folder;
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  while (current?.parentId) {
    const parent: KnowledgeListItem | null =
      byId.get(current.parentId) ?? null;
    if (!parent) break;
    if (categoryRoots.has(parent.path ?? "")) {
      return current;
    }
    current = parent;
  }
  return folder;
}

function resolveSpaceEntryFromDocument(
  doc: KnowledgeListItem,
  documents: readonly KnowledgeListItem[],
  categoryRoots: Set<string>,
): KnowledgeListItem | null {
  const byId = new Map(documents.map((entry) => [entry.id, entry]));
  let current: KnowledgeListItem | null = doc;
  while (current) {
    if (
      current.kind === "folder" &&
      current.parentId &&
      categoryRoots.has(byId.get(current.parentId)?.path ?? "")
    ) {
      return current;
    }
    if (!current.parentId) return null;
    current = (byId.get(current.parentId) ?? null) as KnowledgeListItem | null;
  }
  return null;
}

/** True when the shell side panel should show for this knowledge pathname. */
export function knowledgePathShowsSidePanel(pathname: string): boolean {
  if (isSpacesOverviewPath(pathname)) return false;
  return isKnowledgeSectionPath(pathname);
}
