export type ListKeyboardNavDirection = "up" | "down";

export function stepListKeyboardIndex(
  currentIndex: number,
  direction: ListKeyboardNavDirection,
  length: number,
): number {
  if (length === 0) {
    return -1;
  }

  if (direction === "down") {
    if (currentIndex < 0) {
      return 0;
    }
    return Math.min(currentIndex + 1, length - 1);
  }

  if (currentIndex < 0) {
    return length - 1;
  }
  return Math.max(currentIndex - 1, 0);
}

/**
 * Next row for j/k.
 * - Keyboard highlight: step from it.
 * - Else hover pickup (`hoverAnchorId`): step from the hovered row so j/k
 *   continues from the pointer instead of jumping to the top/selected row.
 * - Else no highlight yet: land on the selected row (or first/last) instead of
 *   stepping past it — so the first `j` after opening Inbox focuses the
 *   open/first item.
 */
export function resolveListKeyboardStepTarget(input: {
  direction: ListKeyboardNavDirection;
  highlightedId: string | null;
  selectedId: string | null;
  itemIds: readonly string[];
  /** Pointer-hovered row to step from when nothing is keyboard-highlighted. */
  hoverAnchorId?: string | null;
}): string | null {
  const { direction, highlightedId, selectedId, itemIds, hoverAnchorId } =
    input;
  if (itemIds.length === 0) return null;

  const hasHighlight =
    highlightedId != null && itemIds.includes(highlightedId);
  if (hasHighlight) {
    const currentIndex = itemIds.indexOf(highlightedId!);
    const nextIndex = stepListKeyboardIndex(
      currentIndex,
      direction,
      itemIds.length,
    );
    return itemIds[nextIndex] ?? null;
  }

  const hoverInList =
    hoverAnchorId != null && itemIds.includes(hoverAnchorId)
      ? hoverAnchorId
      : null;
  if (hoverInList != null) {
    const currentIndex = itemIds.indexOf(hoverInList);
    const nextIndex = stepListKeyboardIndex(
      currentIndex,
      direction,
      itemIds.length,
    );
    return itemIds[nextIndex] ?? null;
  }

  if (selectedId != null && itemIds.includes(selectedId)) {
    return selectedId;
  }
  return direction === "down"
    ? (itemIds[0] ?? null)
    : (itemIds[itemIds.length - 1] ?? null);
}

export function flattenGroupedListItemIds<T>(
  groups: Array<{ key: string; items: T[] }>,
  collapsedKeys: ReadonlySet<string>,
  getItemId: (item: T) => string,
): string[] {
  const result: string[] = [];

  for (const group of groups) {
    if (collapsedKeys.has(group.key)) {
      continue;
    }
    for (const item of group.items) {
      result.push(getItemId(item));
    }
  }

  return result;
}
