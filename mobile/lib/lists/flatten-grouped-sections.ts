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

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    const headerIndex = rows.length;
    rows.push({
      kind: "header",
      key: `header:${section.key}`,
      sectionKey: section.key,
      title: section.title,
    });
    stickyHeaderIndices.push(headerIndex);

    for (const item of section.data) {
      const rowIndex = rows.length;
      rows.push({
        kind: "row",
        key: item.id,
        sectionKey: section.key,
        item,
      });
      rowIndexByItemId.set(item.id, rowIndex);
    }

    // Only between sections — a trailing empty footer measures as 0/`null` and
    // fights FlashList v2's estimated footer size (infinite layout loop).
    const isLast = index === sections.length - 1;
    if (!isLast && options?.includeEmptyFooter?.(section)) {
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
