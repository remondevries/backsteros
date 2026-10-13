import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";

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
  itemIds: readonly string[];
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
  const resolvedEnabled =
    keepAliveActive && (enabled ?? itemIds.length > 0);
  const resolvedZone: ListKeyboardNavZone =
    zone ?? LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL;
  const mutableItemIds: string[] = Array.from(itemIds);
  const landingId = mutableItemIds[0] ?? null;
  const lastLandingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedEnabled || landingId == null) {
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
  }, [landingId, pathname, resolvedEnabled, resolvedZone, setActiveZone]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: mutableItemIds,
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
