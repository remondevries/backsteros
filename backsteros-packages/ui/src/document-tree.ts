/** Minimal document row needed to build a folder/document tree. */
export type DocumentTreeSource = {
  id: string;
  title: string;
  path: string;
  kind: "document" | "folder";
  parentId: string | null;
  sortOrder: number;
  icon?: string | null;
};

export type DocumentTreeFolderNode = {
  type: "folder";
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  children: DocumentTreeNode[];
};

export type DocumentTreeDocumentNode = {
  type: "document";
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  path: string;
};

export type DocumentTreeNode = DocumentTreeFolderNode | DocumentTreeDocumentNode;

const FOLDER_NAV_ID_PREFIX = "folder:";

export function folderNavId(folderId: string): string {
  return `${FOLDER_NAV_ID_PREFIX}${folderId}`;
}

export function parseFolderNavId(navId: string): string | null {
  return navId.startsWith(FOLDER_NAV_ID_PREFIX)
    ? navId.slice(FOLDER_NAV_ID_PREFIX.length)
    : null;
}

function sortSiblings(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/** Builds a folder/document tree from flat document rows using `parentId`/`kind`. */
export function buildDocumentTree(
  documents: DocumentTreeSource[],
): DocumentTreeNode[] {
  const nodesById = new Map<string, DocumentTreeNode>();

  for (const document of documents) {
    if (document.kind === "folder") {
      nodesById.set(document.id, {
        type: "folder",
        id: document.id,
        title: document.title,
        icon: document.icon ?? null,
        parentId: document.parentId,
        sortOrder: document.sortOrder,
        children: [],
      });
    } else {
      nodesById.set(document.id, {
        type: "document",
        id: document.id,
        title: document.title,
        icon: document.icon ?? null,
        parentId: document.parentId,
        sortOrder: document.sortOrder,
        path: document.path,
      });
    }
  }

  const roots: DocumentTreeNode[] = [];

  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      const parent = nodesById.get(node.parentId)!;
      if (parent.type === "folder") {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  function sortRecursive(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
    const sorted = sortSiblings(nodes);
    for (const node of sorted) {
      if (node.type === "folder") {
        node.children = sortRecursive(node.children);
      }
    }
    return sorted;
  }

  return sortRecursive(roots);
}

export function flattenVisibleDocumentTreeNavItemIds(
  tree: DocumentTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];

  function visit(nodes: DocumentTreeNode[]) {
    for (const node of nodes) {
      if (node.type === "folder") {
        ids.push(folderNavId(node.id));
        if (!collapsedFolderIds.has(node.id)) {
          visit(node.children);
        }
      } else {
        ids.push(node.id);
      }
    }
  }

  visit(tree);
  return ids;
}

export function findDocumentTreeNodeById(
  tree: DocumentTreeNode[],
  id: string,
): DocumentTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.type === "folder") {
      const found = findDocumentTreeNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function countDocumentTreeFolderItems(
  folder: DocumentTreeFolderNode,
): number {
  let count = 0;
  for (const child of folder.children) {
    count += 1;
    if (child.type === "folder") {
      count += countDocumentTreeFolderItems(child);
    }
  }
  return count;
}

export function formatFolderDeleteConfirmLabel(itemCount: number): string {
  if (itemCount === 0) {
    return "You're about to delete a folder. Are you sure?";
  }

  const noun = itemCount === 1 ? "item" : "items";
  return `You're about to delete a folder with ${itemCount} ${noun} in it. Are you sure?`;
}

export function findDocumentIdByPath(
  tree: DocumentTreeNode[],
  path: string,
): string | null {
  for (const node of tree) {
    if (node.type === "document" && node.path === path) {
      return node.id;
    }
    if (node.type === "folder") {
      const found = findDocumentIdByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}
