/** Prefer the item that was next in the list; otherwise the previous one. */
export function pickNextItemAfterRemoval<T>(
  items: readonly T[],
  isRemoved: (item: T) => boolean,
): T | undefined {
  const index = items.findIndex((item) => isRemoved(item));
  const remaining = items.filter((item) => !isRemoved(item));

  if (remaining.length === 0) {
    return undefined;
  }

  if (index < 0) {
    return remaining[0];
  }

  return remaining[index] ?? remaining[index - 1];
}
