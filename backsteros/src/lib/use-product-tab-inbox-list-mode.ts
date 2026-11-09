import { useCallback, useSyncExternalStore } from "react";

import {
  readInboxListMode,
  writeInboxListMode,
  type InboxListMode,
} from "@backsteros/ui";

import {
  getProductTabUiEpoch,
  getProductTabUiState,
  patchProductTabInboxUi,
  subscribeProductTabUi,
} from "./product-tab-ui-state";
import {
  getWarmKeepAliveActiveProductTabId,
  getWarmKeepAliveEpoch,
  subscribeWarmKeepAlive,
} from "./shell-warm-keep-alive";

/**
 * Inbox list mode scoped to the active product tab.
 * New tabs seed once from the app-wide last-used preference; switching tabs
 * restores each tab’s own mode without remounting the keep-alive tree.
 */
export function useProductTabInboxListMode(): [
  InboxListMode,
  (mode: InboxListMode) => void,
] {
  const subscribe = useCallback((onChange: () => void) => {
    const unsubUi = subscribeProductTabUi(onChange);
    const unsubWarm = subscribeWarmKeepAlive(onChange);
    return () => {
      unsubUi();
      unsubWarm();
    };
  }, []);

  const mode = useSyncExternalStore(
    subscribe,
    () => {
      void getProductTabUiEpoch();
      void getWarmKeepAliveEpoch();
      const tabId = getWarmKeepAliveActiveProductTabId();
      if (!tabId) return readInboxListMode();
      const slice = getProductTabUiState(tabId).inbox;
      if (slice.listMode != null) return slice.listMode;
      return readInboxListMode();
    },
    readInboxListMode,
  );

  const setMode = useCallback((next: InboxListMode) => {
    const tabId = getWarmKeepAliveActiveProductTabId();
    // Seed preference for brand-new tabs only — do not force siblings to follow.
    writeInboxListMode(next);
    if (tabId) {
      patchProductTabInboxUi(tabId, { listMode: next });
    }
  }, []);

  return [mode, setMode];
}
