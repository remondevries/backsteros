export type KanbanDropIndicator = {
  columnKey: string;
  beforeItemId: string | null;
};

export function computeKanbanDropIndicator<TItem>({
  columnKey,
  columnItems,
  draggedItem,
  draggedItemId,
  getItemColumnKey,
  compareItems,
  getItemId,
}: {
  columnKey: string;
  columnItems: TItem[];
  draggedItem: TItem;
  draggedItemId: string;
  getItemColumnKey: (item: TItem) => string;
  compareItems: (left: TItem, right: TItem) => number;
  getItemId: (item: TItem) => string;
}): KanbanDropIndicator | null {
  const fromColumnKey = getItemColumnKey(draggedItem);
  if (fromColumnKey === columnKey) {
    return null;
  }

  const targetItems = columnItems.filter(
    (item) => getItemId(item) !== draggedItemId,
  );
  let insertionIndex = targetItems.length;

  for (let index = 0; index < targetItems.length; index += 1) {
    if (compareItems(draggedItem, targetItems[index]!) < 0) {
      insertionIndex = index;
      break;
    }
  }

  return {
    columnKey,
    beforeItemId: targetItems[insertionIndex]
      ? getItemId(targetItems[insertionIndex]!)
      : null,
  };
}
