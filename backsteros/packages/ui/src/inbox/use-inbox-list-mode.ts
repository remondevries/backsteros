import { useCallback, useSyncExternalStore } from "react";

import type { InboxListMode } from "./inbox-list-mode.js";
import {
  readInboxListMode,
  subscribeInboxListMode,
  writeInboxListMode,
} from "./inbox-list-mode-storage.js";

export function useInboxListMode(): [
  InboxListMode,
  (mode: InboxListMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribeInboxListMode,
    readInboxListMode,
    readInboxListMode,
  );
  const setMode = useCallback((next: InboxListMode) => {
    writeInboxListMode(next);
  }, []);
  return [mode, setMode];
}
