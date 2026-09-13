import type { KnowledgeListItem } from "../navigation/entity-routes.js";
import {
  findKnowledgeFolderByPath,
  listSpaceChildFolders,
  SPACES_CATEGORIES,
  type SpacesCategoryId,
} from "./spaces-categories.js";

export type SpaceReorderRequest = {
  spaceId: string;
  categoryId: SpacesCategoryId;
  beforeSpaceId: string | null;
};

export function spaceOrderKey(spaceId: string): string {
  return `space:${spaceId}`;
}

/** Insert-after indicator key for grid cards (right-side bar). */
export function spaceOrderAfterKey(spaceId: string): string {
  return `space:${spaceId}:after`;
}

export function spaceGroupAppendOrderKey(categoryId: SpacesCategoryId): string {
  return `space-group:${categoryId}:append`;
}

export function isSpacesCategoryId(value: string): value is SpacesCategoryId {
  return SPACES_CATEGORIES.some((category) => category.id === value);
}

/**
 * Sibling folder ids under a category root after inserting `spaceId` before
 * `beforeSpaceId` (or appending when `beforeSpaceId` is null).
 */
export function buildSpaceSiblingOrderIds(
  documents: readonly KnowledgeListItem[],
  request: SpaceReorderRequest,
): string[] | null {
  const category = SPACES_CATEGORIES.find(
    (entry) => entry.id === request.categoryId,
  );
  if (!category) return null;
  const root = findKnowledgeFolderByPath(documents, category.rootPath);
  if (!root) return null;

  const siblings = listSpaceChildFolders(documents, category.rootPath);
  if (!siblings.some((sibling) => sibling.id === request.spaceId)) {
    return null;
  }

  const ids = siblings
    .filter((sibling) => sibling.id !== request.spaceId)
    .map((sibling) => sibling.id);
  const insertAt = request.beforeSpaceId
    ? ids.indexOf(request.beforeSpaceId)
    : -1;
  if (insertAt === -1) ids.push(request.spaceId);
  else ids.splice(insertAt, 0, request.spaceId);
  return ids;
}

/** Optimistic `sortOrder` patch for space sibling reorder. */
export function applyOptimisticSpaceReorder(
  documents: readonly KnowledgeListItem[],
  request: SpaceReorderRequest,
): KnowledgeListItem[] {
  const ids = buildSpaceSiblingOrderIds(documents, request);
  if (!ids) return [...documents];
  const orderById = new Map(ids.map((id, index) => [id, index]));
  return documents.map((doc) => {
    const sortOrder = orderById.get(doc.id);
    if (sortOrder === undefined) return doc;
    return { ...doc, sortOrder };
  });
}
