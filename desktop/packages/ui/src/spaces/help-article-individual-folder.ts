/**
 * Support center Individual list lives under a reserved folder `_individual`.
 * It is hidden from Group / overview / placement, and its children surface as
 * the Individual side-panel tree root.
 */

import { normalizeSpacesDocumentPath } from "./spaces-categories.js";
import type { KnowledgeListItem } from "../navigation/entity-routes.js";

/** Reserved folder slug/title under a Support space. */
export const HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG = "_individual";

export function helpArticleIndividualRootPath(
  supportRootPath: string = "support",
): string {
  const root = normalizeSpacesDocumentPath(supportRootPath) || "support";
  return `${root}/${HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG}`;
}

/** True when this folder is the reserved Individual root (by path or title). */
export function isHelpArticleIndividualRootFolder(
  doc: Pick<KnowledgeListItem, "kind" | "title" | "path">,
): boolean {
  if (doc.kind !== "folder") return false;
  if (doc.title.trim() === HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG) return true;
  const base =
    normalizeSpacesDocumentPath(doc.path).split("/").filter(Boolean).pop() ??
    "";
  return base === HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG;
}

export function findHelpArticleIndividualRoot(
  documents: readonly KnowledgeListItem[],
): KnowledgeListItem | null {
  return (
    documents.find((doc) => isHelpArticleIndividualRootFolder(doc)) ?? null
  );
}

/**
 * Ids of the Individual root and every descendant (folders + documents).
 * Empty set when the root is missing.
 */
export function collectHelpArticleIndividualTreeIds(
  documents: readonly KnowledgeListItem[],
  individualRootId?: string | null,
): Set<string> {
  const rootId =
    individualRootId ?? findHelpArticleIndividualRoot(documents)?.id ?? null;
  if (!rootId) return new Set();

  const childrenByParent = new Map<string, string[]>();
  for (const doc of documents) {
    if (!doc.parentId) continue;
    const list = childrenByParent.get(doc.parentId);
    if (list) list.push(doc.id);
    else childrenByParent.set(doc.parentId, [doc.id]);
  }

  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      stack.push(childId);
    }
  }
  return ids;
}

export function isInHelpArticleIndividualTree(
  docId: string,
  individualTreeIds: ReadonlySet<string>,
): boolean {
  return individualTreeIds.has(docId);
}
