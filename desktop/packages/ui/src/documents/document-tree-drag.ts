import type { DocumentTreeNode } from "./document-tree.js";
import {
  parseTreeDragPayload,
  treeNodeOrderKey,
  type TreeDragPayload,
  type TreeReorderRequest,
} from "./document-tree-order.js";

export type { TreeReorderRequest };

export const DOCUMENT_TREE_DRAG_TYPE = "application/x-backsteros-tree-item";

/** Fallback — custom MIME types are often invisible during dragover in WKWebView/Tauri. */
export const DOCUMENT_TREE_DRAG_FALLBACK_TYPE = "text/plain";

export function createTreeDragPayload(
  node: DocumentTreeNode,
  parentId: string | null,
): string {
  return JSON.stringify({
    type: node.type,
    id: node.id,
    parentId,
  } satisfies TreeDragPayload);
}

export function readTreeDragPayload(
  dataTransfer: DataTransfer,
): TreeDragPayload | null {
  const custom = dataTransfer.getData(DOCUMENT_TREE_DRAG_TYPE);
  if (custom) return parseTreeDragPayload(custom);
  const fallback = dataTransfer.getData(DOCUMENT_TREE_DRAG_FALLBACK_TYPE);
  if (fallback) return parseTreeDragPayload(fallback);
  return null;
}

export function writeTreeDragPayload(
  dataTransfer: DataTransfer,
  node: DocumentTreeNode,
  parentId: string | null,
): void {
  const payload = createTreeDragPayload(node, parentId);
  dataTransfer.setData(DOCUMENT_TREE_DRAG_TYPE, payload);
  dataTransfer.setData(DOCUMENT_TREE_DRAG_FALLBACK_TYPE, payload);
}

export function isTreeDragActive(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes(DOCUMENT_TREE_DRAG_TYPE) ||
    types.includes(DOCUMENT_TREE_DRAG_FALLBACK_TYPE)
  );
}

export function resolveFolderDragOverMode(
  payload: TreeDragPayload | null,
  folderId: string,
  folderParentId: string | null,
): "into" | "before" | null {
  if (!payload || payload.id === folderId) return null;

  if (payload.type === "folder") {
    return folderParentId === payload.parentId ? "before" : null;
  }

  return payload.parentId === folderId ? "before" : "into";
}

export function resolveTreeDropAction(input: {
  payload: TreeDragPayload;
  targetNode: DocumentTreeNode;
  targetParentId: string | null;
}): TreeReorderRequest | null {
  const { payload, targetNode, targetParentId } = input;
  if (payload.id === targetNode.id) return null;

  if (
    payload.type === "document" &&
    targetNode.type === "folder" &&
    payload.parentId !== targetNode.id
  ) {
    return {
      itemType: payload.type,
      itemId: payload.id,
      fromParentId: payload.parentId,
      toParentId: targetNode.id,
      beforeId: null,
    };
  }

  if (payload.type === "folder" && targetParentId !== payload.parentId) {
    return null;
  }

  return {
    itemType: payload.type,
    itemId: payload.id,
    fromParentId: payload.parentId,
    toParentId: targetParentId,
    beforeId: treeNodeOrderKey(targetNode),
  };
}
