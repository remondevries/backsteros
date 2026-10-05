/** Keep the current list selection when it still exists; otherwise take the first item. */
export function resolveCodebaseListSelection<TId>(
  itemIds: readonly TId[],
  selectedId: TId | null,
): TId | null {
  if (itemIds.length === 0) return null;
  if (selectedId != null && itemIds.includes(selectedId)) return selectedId;
  return itemIds[0] ?? null;
}
