/** Minimal document row needed to build a folder/document tree. */
export type DocumentTreeSource = {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly kind: "document" | "folder";
  readonly parentId: string | null;
  readonly sortOrder: number;
};

export type DocumentTreeFolderNode = {
  readonly type: "folder";
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
  children: DocumentTreeNode[];
};

export type DocumentTreeDocumentNode = {
  readonly type: "document";
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly path: string;
};

export type DocumentTreeNode = DocumentTreeFolderNode | DocumentTreeDocumentNode;

function sortSiblings(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/** Builds a folder/document tree from flat document rows using `parentId`/`kind`. */
export function buildDocumentTree(documents: readonly DocumentTreeSource[]): DocumentTreeNode[] {
  const nodesById = new Map<string, DocumentTreeNode>();

  for (const document of documents) {
    if (document.kind === "folder") {
      nodesById.set(document.id, {
        type: "folder",
        id: document.id,
        title: document.title,
        parentId: document.parentId,
        sortOrder: document.sortOrder,
        children: [],
      });
    } else {
      nodesById.set(document.id, {
        type: "document",
        id: document.id,
        title: document.title,
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

/** Flat repo `docs/` entries (+ pinned root files) → tree sources. */
export function codebaseRepoDocsToTreeSources(
  entries: readonly {
    readonly name: string;
    readonly path: string;
    readonly kind: "file" | "directory";
    readonly pinned: boolean;
  }[],
): DocumentTreeSource[] {
  return entries.map((entry) => {
    const slash = entry.path.lastIndexOf("/");
    return {
      id: entry.path,
      title: entry.name,
      path: entry.path,
      kind: entry.kind === "directory" ? ("folder" as const) : ("document" as const),
      parentId: slash === -1 ? null : entry.path.slice(0, slash),
      sortOrder: entry.pinned ? -1 : entry.kind === "directory" ? 0 : 1,
    };
  });
}
