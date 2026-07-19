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
