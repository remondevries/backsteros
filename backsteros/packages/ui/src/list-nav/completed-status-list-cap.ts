/** Initial visible rows in a capped status group before Show more. */
export const COMPLETED_STATUS_LIST_INITIAL_VISIBLE = 25;

/** Extra rows revealed each time Show more is clicked. */
export const COMPLETED_STATUS_LIST_PAGE_SIZE = 25;

/** Terminal status groups that grow large and should start capped. */
export const CAPPED_STATUS_LIST_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

export type CappedStatusListStatus =
  (typeof CAPPED_STATUS_LIST_STATUSES)[number];

export type CompletedStatusSlice<T> = {
  visibleItems: readonly T[];
  hiddenCount: number;
};

export type CappedStatusVisibleCounts = Readonly<
  Partial<Record<string, number>>
>;

export function isCappedStatusListStatus(
  status: string,
): status is CappedStatusListStatus {
  return (CAPPED_STATUS_LIST_STATUSES as readonly string[]).includes(status);
}

export function cappedStatusVisibleCount(
  status: string,
  visibleCounts: CappedStatusVisibleCounts,
  fallback: number = COMPLETED_STATUS_LIST_INITIAL_VISIBLE,
): number {
  const configured = visibleCounts[status];
  if (typeof configured === "number" && Number.isFinite(configured)) {
    return Math.max(0, Math.floor(configured));
  }
  return Math.max(0, Math.floor(fallback));
}

/**
 * Cap a status group's rows for list performance.
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
 * Apply the terminal-group cap to status-grouped lists.
 * `completed`, `canceled`, and `duplicated` are sliced; other groups pass through.
 */
export function mapStatusGroupsWithCompletedCap<
  TItem,
  TGroup extends { status: string; items: readonly TItem[] },
>(
  groups: readonly TGroup[],
  visibleCounts:
    | number
    | CappedStatusVisibleCounts = COMPLETED_STATUS_LIST_INITIAL_VISIBLE,
): Array<TGroup & { hiddenCount: number }> {
  const counts: CappedStatusVisibleCounts =
    typeof visibleCounts === "number"
      ? {
          completed: visibleCounts,
          canceled: visibleCounts,
          duplicated: visibleCounts,
        }
      : visibleCounts;

  return groups.map((group) => {
    if (!isCappedStatusListStatus(group.status)) {
      return { ...group, items: group.items, hiddenCount: 0 };
    }
    const { visibleItems, hiddenCount } = sliceCompletedStatusItems(
      group.items,
      cappedStatusVisibleCount(group.status, counts),
    );
    return { ...group, items: visibleItems, hiddenCount };
  });
}
