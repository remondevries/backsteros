import type { KnowledgeListItem } from "../navigation/entity-routes.js";
import {
  countArticlesInFolder,
  listSpaceChildFolders,
  normalizeSpacesDocumentPath,
  SPACES_CATEGORIES,
} from "./spaces-categories.js";

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Prefer the Spaces overview sibling that matches the server hierarchy:
 * nested category path, more articles, then newer updatedAt.
 */
export function preferSpaceOverviewSibling(
  a: KnowledgeListItem,
  b: KnowledgeListItem,
  documents: readonly KnowledgeListItem[],
): KnowledgeListItem {
  const pathA = normalizeSpacesDocumentPath(a.path);
  const pathB = normalizeSpacesDocumentPath(b.path);
  const nestedA = pathA.includes("/");
  const nestedB = pathB.includes("/");
  if (nestedA !== nestedB) return nestedA ? a : b;

  const countA = countArticlesInFolder(documents, a.id);
  const countB = countArticlesInFolder(documents, b.id);
  if (countA !== countB) return countA > countB ? a : b;

  const updatedA = a.updatedAt ?? 0;
  const updatedB = b.updatedAt ?? 0;
  if (updatedA !== updatedB) return updatedA > updatedB ? a : b;

  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

/**
 * Local-only duplicate space cards under the same category (same title).
 * Returns ids that should be soft-deleted so the overview matches the API.
 */
export function findDuplicateSpaceOverviewIdsToDelete(
  documents: readonly KnowledgeListItem[],
): string[] {
  const deleteIds: string[] = [];
  for (const category of SPACES_CATEGORIES) {
    const children = listSpaceChildFolders(documents, category.rootPath);
    const byTitle = new Map<string, KnowledgeListItem[]>();
    for (const child of children) {
      const key = titleKey(child.title);
      const list = byTitle.get(key) ?? [];
      list.push(child);
      byTitle.set(key, list);
    }
    for (const group of byTitle.values()) {
      if (group.length < 2) continue;
      let keep = group[0]!;
      for (let i = 1; i < group.length; i++) {
        keep = preferSpaceOverviewSibling(keep, group[i]!, documents);
      }
      for (const child of group) {
        if (child.id !== keep.id) deleteIds.push(child.id);
      }
    }
  }
  return deleteIds;
}

export type SpacePublishCandidate = {
  categoryRootPath: string;
  parentFolderId: string;
  title: string;
  icon: string | null;
  path: string | null;
};

/**
 * Local category children whose title is not present on the API snapshot.
 * These should be created on the server so agents see the same overview cards.
 */
export function findLocalOnlySpacesToPublish(
  localDocuments: readonly KnowledgeListItem[],
  apiDocuments: readonly KnowledgeListItem[],
): SpacePublishCandidate[] {
  const out: SpacePublishCandidate[] = [];
  for (const category of SPACES_CATEGORIES) {
    const localChildren = listSpaceChildFolders(
      localDocuments,
      category.rootPath,
    );
    const apiChildren = listSpaceChildFolders(apiDocuments, category.rootPath);
    const apiTitles = new Set(apiChildren.map((child) => titleKey(child.title)));
    const root = localDocuments.find(
      (doc) =>
        doc.kind === "folder" &&
        normalizeSpacesDocumentPath(doc.path) === category.rootPath,
    );
    if (!root) continue;
    for (const child of localChildren) {
      if (apiTitles.has(titleKey(child.title))) continue;
      out.push({
        categoryRootPath: category.rootPath,
        parentFolderId: root.id,
        title: child.title,
        icon: child.icon ?? null,
        path: child.path ?? null,
      });
    }
  }
  return out;
}
