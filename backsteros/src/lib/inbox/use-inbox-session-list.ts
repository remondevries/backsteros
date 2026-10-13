import { useMemo, useRef } from "react";

import type { InboxListItem } from "@backsteros/ui";

import {
  buildInboxSessionList,
  type InboxSessionPin,
} from "./build-inbox-session-list";

export function useInboxSessionList(
  inInboxPanel: boolean,
  ready: boolean,
  sortedItems: readonly InboxListItem[],
  pinnedItems: ReadonlyMap<string, InboxSessionPin>,
): InboxListItem[] {
  const displayOrderRef = useRef<string[]>([]);

  return useMemo(() => {
    if (!inInboxPanel) {
      displayOrderRef.current = [];
      return [...sortedItems];
    }
    if (!ready) {
      return [...sortedItems];
    }

    const { items, displayOrder } = buildInboxSessionList({
      sortedItems,
      pinnedItems,
      displayOrder: displayOrderRef.current,
    });
    displayOrderRef.current = displayOrder;
    return items;
  }, [inInboxPanel, pinnedItems, ready, sortedItems]);
}
