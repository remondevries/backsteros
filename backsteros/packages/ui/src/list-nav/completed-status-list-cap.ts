/** Initial visible rows in a Completed status group before Show more. */
export const COMPLETED_STATUS_LIST_INITIAL_VISIBLE = 50;

/** Extra rows revealed each time Show more is clicked. */
export const COMPLETED_STATUS_LIST_PAGE_SIZE = 50;

export type CompletedStatusSlice<T> = {
  visibleItems: readonly T[];
  hiddenCount: number;
};

/**
 * Cap a Completed status group's rows for list performance.
 * Non-completed groups should pass through without calling this.
 */
export function sliceCompletedStatusItems<T>(
  items: readonly T[],
  visibleCount: number,
): CompletedStatusSlice<T> {
  const limit = Math.max(0, Math.floor(visibleCount));
  if (items.length <= limit) {
    return { visibleItems: items, hiddenCount: 0 };
  }
  return {
    visibleItems: items.slice(0, limit),
    hiddenCount: items.length - limit,
  };
}

export function nextCompletedStatusVisibleCount(
  currentVisible: number,
  total: number,
  pageSize: number = COMPLETED_STATUS_LIST_PAGE_SIZE,
): number {
  const step = Math.max(1, Math.floor(pageSize));
  const current = Math.max(0, Math.floor(currentVisible));
  return Math.min(Math.max(0, total), current + step);
}

/**
 * Apply the completed-group cap to status-grouped lists.
 * Only the `completed` status is sliced; other groups are unchanged.
 */
export function mapStatusGroupsWithCompletedCap<
  TItem,
  TGroup extends { status: string; items: readonly TItem[] },
>(
  groups: readonly TGroup[],
  completedVisibleCount: number,
): Array<TGroup & { hiddenCount: number }> {
  return groups.map((group) => {
    if (group.status !== "completed") {
      return { ...group, items: group.items, hiddenCount: 0 };
    }
    const { visibleItems, hiddenCount } = sliceCompletedStatusItems(
      group.items,
      completedVisibleCount,
    );
    return { ...group, items: visibleItems, hiddenCount };
  });
}
