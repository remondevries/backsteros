import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";

import {
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  type ListKeyboardNavZone,
} from "@backsteros/ui";

export type UseDesktopSidePanelListNavOptions = {
  itemIds: readonly string[];
  selectedId: string | null;
  onNavigate: (itemId: string) => void;
  enabled?: boolean;
  /** Prefetch when j/k highlight changes. */
  prefetchItemId?: (itemId: string) => void;
  zone?: ListKeyboardNavZone;
};

export type UseDesktopSidePanelListNavResult = {
  listRef: RefObject<HTMLElement | null>;
  highlightedId: string | null;
  listContainerProps: HTMLAttributes<HTMLElement>;
};

/**
 * Shared keyboard-nav wiring for simple content side panels
 * (contacts, orgs, letters, journal, knowledge).
 */
export function useDesktopSidePanelListNav({
  itemIds,
  selectedId,
  onNavigate,
  enabled,
  prefetchItemId,
  zone,
}: UseDesktopSidePanelListNavOptions): UseDesktopSidePanelListNavResult {
  const listRef = useRef<HTMLElement>(null);
  const resolvedEnabled = enabled ?? itemIds.length > 0;
  const resolvedZone: ListKeyboardNavZone =
    zone ?? LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL;
  const mutableItemIds: string[] = Array.from(itemIds);

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
