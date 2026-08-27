import type { TreeReorderRequest } from "@backsteros/ui/navigation";
import {
  buildDocumentTree,
  findDocumentTreeNodeById,
} from "@backsteros/ui/navigation";

type DocumentTreeSource = {
  id: string;
  title: string;
  path: string;
  kind: "folder" | "document";
  parentId: string | null;
  sortOrder: number;
  icon: string | null;
};

type DocumentActions = {
  moveDocument: (itemId: string, parentId: string | null) => Promise<unknown>;
  reorderDocuments: (ids: string[]) => Promise<unknown>;
};

export function handleDocumentTreeReorder(
  request: TreeReorderRequest,
  documents: DocumentTreeSource[],
  actions: DocumentActions,
) {
  const tree = buildDocumentTree(documents);
  void (async () => {
    if (request.fromParentId !== request.toParentId) {
      await actions.moveDocument(request.itemId, request.toParentId);
      return;
    }
    const parent =
      request.toParentId === null
        ? null
        : findDocumentTreeNodeById(tree, request.toParentId);
    const siblings =
      parent === null
        ? tree
        : parent.type === "folder"
          ? parent.children
          : [];
    const ids = siblings
      .filter((node) => node.id !== request.itemId)
      .map((node) => node.id);
    const insertAt = request.beforeId ? ids.indexOf(request.beforeId) : -1;
    if (insertAt === -1) ids.push(request.itemId);
    else ids.splice(insertAt, 0, request.itemId);
    await actions.reorderDocuments(ids);
  })();
}
