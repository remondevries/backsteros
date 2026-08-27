export type DocumentTreeRow = {
  id: string;
  title: string | null;
  path: string | null;
  kind: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

export function compareDocumentTreeRows(
  left: DocumentTreeRow,
  right: DocumentTreeRow,
): number {
  const leftOrder = left.sort_order ?? 0;
  const rightOrder = right.sort_order ?? 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return (left.path || left.title || "").localeCompare(
    right.path || right.title || "",
    undefined,
    { sensitivity: "base" },
  );
}

export function documentSiblingRows(
  rows: readonly DocumentTreeRow[],
  itemId: string,
): DocumentTreeRow[] {
  const item = rows.find((row) => row.id === itemId);
  if (!item) return [];
  const parentId = item.parent_id ?? null;
  return rows
    .filter((row) => (row.parent_id ?? null) === parentId)
    .sort(compareDocumentTreeRows);
}

export function reorderSiblingIds(
  siblings: readonly DocumentTreeRow[],
  itemId: string,
  direction: "up" | "down",
): string[] | null {
  const ids = siblings.map((row) => row.id);
  const index = ids.indexOf(itemId);
  if (index < 0) return null;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ids.length) return null;
  const next = [...ids];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}

function folderDescendantIds(
  rows: readonly DocumentTreeRow[],
  folderId: string,
): Set<string> {
  const descendants = new Set<string>();
  const walk = (parentId: string) => {
    for (const row of rows) {
      if (row.parent_id === parentId) {
        descendants.add(row.id);
        if (row.kind === "folder") walk(row.id);
      }
    }
  };
  walk(folderId);
  return descendants;
}

export type DocumentMoveFolderOption = {
  id: string | null;
  label: string;
};

/** Valid reparent targets for a document (folders + root). */
export function documentMoveFolderOptions(
  rows: readonly DocumentTreeRow[],
  itemId: string,
): DocumentMoveFolderOption[] {
  const item = rows.find((row) => row.id === itemId);
  if (!item || item.kind === "folder") return [];

  const invalid = new Set([itemId]);
  const currentParent = item.parent_id ?? null;
  const options: DocumentMoveFolderOption[] = [];

  if (currentParent !== null) {
    options.push({ id: null, label: "Root" });
  }

  for (const row of rows) {
    if (row.kind !== "folder" || invalid.has(row.id)) continue;
    if (row.id === currentParent) continue;
    options.push({
      id: row.id,
      label: row.title?.trim() || row.path || "Folder",
    });
  }

  return options.sort((left, right) => {
    if (left.id === null) return -1;
    if (right.id === null) return 1;
    return left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    });
  });
}
