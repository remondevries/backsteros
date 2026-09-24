/**
 * Persisted Communication channel (Everything / Email / WhatsApp / Chat / Support).
 */

import {
  DEFAULT_COMMUNICATION_LIST_FILTER,
  parseCommunicationListFilter,
  type CommunicationListFilter,
} from "./communication.js";

const STORAGE_KEY = "backsteros.communication.list-filter";

const listeners = new Set<() => void>();

let cachedFilter: CommunicationListFilter | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeCommunicationListFilter(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCommunicationListFilter(): CommunicationListFilter {
  if (cachedFilter != null) return cachedFilter;
  if (typeof window === "undefined") {
    return DEFAULT_COMMUNICATION_LIST_FILTER;
  }
  try {
    cachedFilter = parseCommunicationListFilter(
      window.localStorage.getItem(STORAGE_KEY),
    );
  } catch {
    cachedFilter = DEFAULT_COMMUNICATION_LIST_FILTER;
  }
  return cachedFilter;
}

export function writeCommunicationListFilter(
  filter: CommunicationListFilter,
): void {
  const next = parseCommunicationListFilter(filter);
  if (cachedFilter === next) return;
  cachedFilter = next;
  if (typeof window !== "undefined") {
    try {
      if (next === DEFAULT_COMMUNICATION_LIST_FILTER) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Ignore quota / private-mode failures.
    }
  }
  notify();
}
