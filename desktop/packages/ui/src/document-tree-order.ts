import type { DocumentTreeNode } from "./document-tree.js";

export type TreeDragItemType = "document" | "folder";

export type TreeDragPayload = {
  type: TreeDragItemType;
  id: string;
  parentId: string | null;
};

export type TreeReorderRequest = {
  itemType: TreeDragItemType;
  itemId: string;
  fromParentId: string | null;
  toParentId: string | null;
  beforeId?: string | null;
};

export function treeNodeOrderKey(node: DocumentTreeNode): string {
  return node.id;
}

export function parseTreeDragPayload(raw: string): TreeDragPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<TreeDragPayload>;
    if (
      (parsed.type !== "document" && parsed.type !== "folder") ||
      typeof parsed.id !== "string" ||
      (typeof parsed.parentId !== "string" && parsed.parentId !== null)
    ) {
      return null;
    }

    return {
      type: parsed.type,
      id: parsed.id,
      parentId: parsed.parentId,
    };
  } catch {
    return null;
  }
}
