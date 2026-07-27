"use client";

import {
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

import { useListKeyboardNavigation } from "@/components/shortcuts/list-keyboard-navigation-provider";
import {
  activateContentPreviewLink,
  syncContentPreviewLinkHighlights,
  syncContentPreviewLinkMarkers,
} from "@/lib/shortcuts/content-preview-links";
import {
  LIST_KEYBOARD_NAV_CONTENT_PRIORITY,
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
} from "@/lib/shortcuts/list-keyboard-nav-zone";

export function useContentPreviewLinkNavigation({
  containerRef,
  body,
}: {
  containerRef: RefObject<HTMLElement | null>;
  body: string;
}): void {
  const [itemIds, setItemIds] = useState<string[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setItemIds([]);
      return;
    }

    setItemIds(syncContentPreviewLinkMarkers(container));
  }, [body, containerRef]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef,
    itemIds,
    selectedId: null,
    onNavigate: (itemId) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      activateContentPreviewLink(container, itemId);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    priority: LIST_KEYBOARD_NAV_CONTENT_PRIORITY,
    enabled: itemIds.length > 0,
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    syncContentPreviewLinkHighlights(container, highlightedId);
  }, [containerRef, highlightedId, itemIds]);
}
