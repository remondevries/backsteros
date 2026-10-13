import { useEffect, useRef } from "react";

import {
  collectInboxUpdatedArrivals,
  snapshotInboxUpdatedKeys,
  type InboxListItem,
} from "@backsteros/ui";

import { showNativeInboxTriageNotification } from "./native-notifications";

/**
 * Fire native macOS notifications when items enter the Inbox Updated section.
 */
export function useInboxUpdatedNotifications(
  items: readonly InboxListItem[],
  ready = true,
  enabled = true,
) {
  const previousKeysRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ready) return;

    const currentKeys = snapshotInboxUpdatedKeys(items);

    if (!seededRef.current) {
      seededRef.current = true;
      previousKeysRef.current = currentKeys;
      return;
    }

    const arrivals = collectInboxUpdatedArrivals({
      previousKeys: previousKeysRef.current,
      items,
    });

    previousKeysRef.current = currentKeys;

    for (const notification of arrivals) {
      void showNativeInboxTriageNotification(notification);
    }
  }, [enabled, items, ready]);
}
