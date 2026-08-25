import { useEffect, useRef } from "react";

import type { InboxListItem } from "@backsteros/ui";

import { useInboxListSessionPin } from "./inbox-list-session-context";

/** Clear the green dot when the user opens an item; pin it in the side list for this inbox visit. */
export function useAcknowledgeInboxUpdateOnView({
  item,
  hasUpdateFlag,
  acknowledge,
}: {
  item: InboxListItem | null;
  hasUpdateFlag: boolean;
  acknowledge: () => void;
}): void {
  const { pinInboxListItem } = useInboxListSessionPin();
  const handledItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item || !hasUpdateFlag) {
      handledItemIdRef.current = null;
      return;
    }

    if (handledItemIdRef.current === item.id) return;
    handledItemIdRef.current = item.id;

    pinInboxListItem(item);
    acknowledge();
  }, [acknowledge, hasUpdateFlag, item, pinInboxListItem]);
}
