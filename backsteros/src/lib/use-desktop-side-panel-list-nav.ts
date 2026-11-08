import {
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type RefObject,
} from "react";

import {
  getDefaultListKeyboardNavZone,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  type ListKeyboardNavZone,
} from "@backsteros/ui";

import { useKeepAliveActive } from "./shell-route-keep-alive";

export type UseDesktopSidePanelListNavOptions = {
  /**
   * Snapshot list for simple panels. Prefer `itemIdsRef` for document trees so
   * folder collapse can update visible ids without a parent re-render.
   */
  itemIds?: readonly string[];
  /**
   * Live visible ids (documents + `folder:` ids). Read on each j/k step; the
   * owning tree writes this ref during render when collapse changes.
   */
  itemIdsRef?: RefObject<readonly string[]>;
  selectedId: string | null;
  onNavigate: (itemId: string) => void;
  enabled?: boolean;
  /** Prefetch when j/k highlight changes. */
  prefetchItemId?: (itemId: string) => void;
  zone?: ListKeyboardNavZone;
  /**
   * Current route. When the path defaults j/k to main (e.g. org Transactions),
   * skip the landing claim so we do not overwrite the content list.
   */
  pathname?: string;
};

export type UseDesktopSidePanelListNavResult = {
  listRef: RefObject<HTMLElement | null>;
  highlightedId: string | null;
  listContainerProps: HTMLAttributes<HTMLElement>;
};

/**
 * Shared keyboard-nav wiring for simple content side panels
 * (contacts, orgs, letters, journal, knowledge).
 *
 * Unregisters while the keep-alive pane is hidden so j/k cannot target a
 * stacked-but-invisible list from another section. Claims the sidepanel zone
 * when this pane becomes visible again (unless the route defaults to main).
 */
export function useDesktopSidePanelListNav({
  itemIds,
  itemIdsRef,
  selectedId,
  onNavigate,
  enabled,
  prefetchItemId,
  zone,
  pathname,
}: UseDesktopSidePanelListNavOptions): UseDesktopSidePanelListNavResult {
  const listRef = useRef<HTMLElement>(null);
  const keepAliveActive = useKeepAliveActive();
  const { setActiveZone } = useListKeyboardNavigationZone();
  const snapshotIds = itemIds ?? [];
  const snapshotIdsRef = useRef(snapshotIds);
  snapshotIdsRef.current = snapshotIds;
  const resolvedEnabled =
    keepAliveActive &&
    (enabled ?? (itemIdsRef?.current ?? snapshotIds).length > 0);
  const resolvedZone: ListKeyboardNavZone =
    zone ?? LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL;
  const mutableItemIds: string[] = Array.from(snapshotIds);
  const lastLandingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedEnabled) {
      lastLandingKeyRef.current = null;
      return;
    }
    const landingId =
      (itemIdsRef?.current ?? snapshotIdsRef.current)[0] ?? null;
    if (landingId == null) {
      lastLandingKeyRef.current = null;
      return;
    }
    if (lastLandingKeyRef.current === "active") return;
    lastLandingKeyRef.current = "active";
    const frame = requestAnimationFrame(() => {
      // Entity tabs (contact tasks, org transactions, …) default j/k to main.
      // Do not steal that claim when the left list mounts alongside them.
      if (
        pathname != null &&
        getDefaultListKeyboardNavZone(pathname) === "main"
      ) {
        return;
      }
      setActiveZone(resolvedZone, {
        preferSidepanelForJk: resolvedZone === "sidepanel",
        activate: true,
        landAtStart: true,
        highlightItemId: landingId,
      });
    });
    return () => cancelAnimationFrame(frame);
    // itemIdsRef / snapshot length: reclaim landing when the list first becomes
    // navigable (items load). Collapse must not retrigger landing.
  }, [
    pathname,
    resolvedEnabled,
    resolvedZone,
    setActiveZone,
    snapshotIds.length,
    itemIdsRef,
  ]);

  const readLiveItemIds = useCallback(
    () => itemIdsRef?.current ?? [],
    [itemIdsRef],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: mutableItemIds,
    getItemIds: itemIdsRef ? readLiveItemIds : undefined,
    selectedId,
    onNavigate,
    zone: resolvedZone,
    enabled: resolvedEnabled,
  });

  useEffect(() => {
    if (highlightedId && prefetchItemId) {
      prefetchItemId(highlightedId);
    }
  }, [highlightedId, prefetchItemId]);

  const listContainerProps =
    useListKeyboardNavigationContainerProps(resolvedZone);

  return { listRef, highlightedId, listContainerProps };
}
