"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { CommunicationListFilter } from "./communication.js";
import {
  readCommunicationListFilter,
  subscribeCommunicationListFilter,
  writeCommunicationListFilter,
} from "./communication-list-filter-storage.js";

export function useCommunicationListFilter(): [
  CommunicationListFilter,
  (filter: CommunicationListFilter) => void,
] {
  const filter = useSyncExternalStore(
    subscribeCommunicationListFilter,
    readCommunicationListFilter,
    readCommunicationListFilter,
  );
  const setFilter = useCallback((next: CommunicationListFilter) => {
    writeCommunicationListFilter(next);
  }, []);
  return [filter, setFilter];
}
