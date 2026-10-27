import { useEffect, useMemo, useRef, useState } from "react";

import type { InboxListItem } from "@backsteros/ui";

import {
  INBOX_EMPTY_COMMIT_DELAY_MS,
  buildInboxSessionList,
  shouldHoldInboxSessionList,
  type InboxSessionPin,
} from "./build-inbox-session-list";

export function useInboxSessionList(
  inInboxPanel: boolean,
  ready: boolean,
  sortedItems: readonly InboxListItem[],
  pinnedItems: ReadonlyMap<string, InboxSessionPin>,
  selectedItemId: string | null = null,
): InboxListItem[] {
  const displayOrderRef = useRef<string[]>([]);
  /** Last painted list — keep across keep-alive freeze so leave/return is not empty. */
  const lastPaintedRef = useRef<InboxListItem[]>([]);
  const [emptyConfirmed, setEmptyConfirmed] = useState(false);

  const { items, holding } = useMemo(() => {
    if (!inInboxPanel) {
      // Do not clear display order or wipe the painted list while the inbox
      // side panel is frozen (user on another section). Returning used to
      // flash empty because sortedItems briefly lacked emails/support.
      return {
        items:
          lastPaintedRef.current.length > 0
            ? lastPaintedRef.current
            : [...sortedItems],
        holding: false,
      };
    }
    if (!ready) {
      const fallback =
        sortedItems.length > 0 ? [...sortedItems] : lastPaintedRef.current;
      if (fallback.length > 0) lastPaintedRef.current = fallback;
      return { items: fallback, holding: false };
    }

    const built = buildInboxSessionList({
      sortedItems,
      pinnedItems,
      displayOrder: displayOrderRef.current,
      selectedItemId,
    });
    if (
      shouldHoldInboxSessionList({
        next: built.items,
        lastPainted: lastPaintedRef.current,
        emptyConfirmed,
      })
    ) {
      return { items: lastPaintedRef.current, holding: true };
    }
    displayOrderRef.current = built.displayOrder;
    lastPaintedRef.current = built.items;
    return { items: built.items, holding: false };
  }, [
    emptyConfirmed,
    inInboxPanel,
    pinnedItems,
    ready,
    selectedItemId,
    sortedItems,
  ]);

  useEffect(() => {
    if (!holding) return;
    const timer = window.setTimeout(
      () => setEmptyConfirmed(true),
      INBOX_EMPTY_COMMIT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [holding]);

  const hasRows = sortedItems.length > 0;
  useEffect(() => {
    if (hasRows) setEmptyConfirmed(false);
  }, [hasRows]);

  return items;
}
