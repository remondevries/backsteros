export type GroupedSection<T> = {
  key: string;
  title: string;
  data: readonly T[];
};

export type FlatGroupedRow<T> =
  | { kind: "header"; key: string; sectionKey: string; title: string }
  | { kind: "row"; key: string; sectionKey: string; item: T }
  | { kind: "footer"; key: string; sectionKey: string };

export function flattenGroupedSections<T extends { id: string }>(
  sections: readonly GroupedSection<T>[],
  options?: {
    includeEmptyFooter?: (section: GroupedSection<T>) => boolean;
  },
): {
  rows: FlatGroupedRow<T>[];
  stickyHeaderIndices: number[];
  rowIndexByItemId: Map<string, number>;
} {
  const rows: FlatGroupedRow<T>[] = [];
  const stickyHeaderIndices: number[] = [];
  const rowIndexByItemId = new Map<string, number>();

  for (const section of sections) {
    const headerIndex = rows.length;
    rows.push({
      kind: "header",
      key: `header:${section.key}`,
      sectionKey: section.key,
      title: section.title,
    });
    stickyHeaderIndices.push(headerIndex);

    for (const item of section.data) {
      const index = rows.length;
      rows.push({
        kind: "row",
        key: item.id,
        sectionKey: section.key,
        item,
      });
      rowIndexByItemId.set(item.id, index);
    }

    if (options?.includeEmptyFooter?.(section)) {
      rows.push({
        kind: "footer",
        key: `footer:${section.key}`,
        sectionKey: section.key,
      });
    }
  }

  return { rows, stickyHeaderIndices, rowIndexByItemId };
}

export function findFlatGroupedRowIndex(
  rowIndexByItemId: ReadonlyMap<string, number>,
  itemId: string,
): number | null {
  const index = rowIndexByItemId.get(itemId);
  return index == null ? null : index;
}
