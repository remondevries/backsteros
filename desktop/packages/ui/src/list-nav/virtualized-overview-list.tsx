"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react";

import {
  scrollKeyboardNavItemIntoView,
} from "./keyboard-nav-item.js";

/** Switch to windowing when a grouped list exceeds this many leaf rows. */
export const OVERVIEW_LIST_VIRTUALIZE_THRESHOLD = 80;

export type VirtualizedOverviewRow = {
  key: string;
  /** Keyboard-nav item id when this row is a selectable entity. */
  itemId?: string;
  estimatedSize?: number;
};

/**
 * LegendList windowing for large overview lists (FlashList equivalent on web).
 * Keeps keyboard highlight scroll-into-view working via itemId markers.
 */
export function VirtualizedOverviewList<T extends VirtualizedOverviewRow>({
  rows,
  highlightedId,
  listRef,
  listContainerProps,
  className,
  style,
  estimatedItemSize = 40,
  renderRow,
}: {
  rows: readonly T[];
  highlightedId: string | null;
  listRef?: Ref<HTMLUListElement | null>;
  listContainerProps?: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
  estimatedItemSize?: number;
  renderRow: (row: T) => ReactNode;
}): ReactElement {
  const legendRef = useRef<LegendListRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!listRef) return;
      // Keyboard-nav registration needs this node (listContainerProps live here).
      // Do not querySelector — `data-overview-virtual-list` is on `node` itself.
      if (typeof listRef === "function") {
        listRef(node as unknown as HTMLUListElement | null);
      } else {
        listRef.current = node as unknown as HTMLUListElement | null;
      }
    },
    [listRef],
  );

  useEffect(() => {
    if (!highlightedId || !containerRef.current) return;
    const index = rows.findIndex((row) => row.itemId === highlightedId);
    if (index >= 0) {
      legendRef.current?.scrollToIndex({ index, animated: false });
    }
    scrollKeyboardNavItemIntoView(containerRef.current, highlightedId);
  }, [highlightedId, rows]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<T>) => (
      <div className="overview-virtual-row">{renderRow(item)}</div>
    ),
    [renderRow],
  );

  return (
    <div
      ref={setContainerRef}
      className={["overview-grouped-list", "overview-grouped-list--virtual", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      {...listContainerProps}
      data-overview-virtual-list=""
      role="list"
    >
      <LegendList
        ref={legendRef}
        data={rows as T[]}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        estimatedItemSize={estimatedItemSize}
        recycleItems
        className="legend-list-scroll"
        style={{ height: "100%", minHeight: 0 }}
      />
    </div>
  );
}
