import { useEffect, useRef } from "react";

import {
  collectInboxTriageArrivals,
  snapshotInboxTriageKeys,
  type InboxListItem,
} from "@backsteros/ui";

import { showNativeInboxTriageNotification } from "./native-notifications";

/**
 * Fire native macOS notifications when items enter the Inbox Triage section.
 */
export function useInboxTriageNotifications(
  items: readonly InboxListItem[],
) {
  const previousKeysRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentKeys = snapshotInboxTriageKeys(items);
    const previousKeys = previousKeysRef.current;
    previousKeysRef.current = currentKeys;

    if (!previousKeys) return;

    const arrivals = collectInboxTriageArrivals({
      previousKeys,
      items,
    });

    for (const notification of arrivals) {
      void showNativeInboxTriageNotification(notification);
    }
  }, [items]);
}
