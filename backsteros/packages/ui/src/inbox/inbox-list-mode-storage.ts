/**
 * Persisted Inbox side-panel mode (Notifications / Messages / Agents).
 */

import {
  DEFAULT_INBOX_LIST_MODE,
  parseInboxListMode,
  type InboxListMode,
} from "./inbox-list-mode.js";

const STORAGE_KEY = "backsteros.inbox.list-mode";

const listeners = new Set<() => void>();

let cachedMode: InboxListMode | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeInboxListMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readInboxListMode(): InboxListMode {
  if (cachedMode != null) return cachedMode;
  if (typeof window === "undefined") {
    return DEFAULT_INBOX_LIST_MODE;
  }
  try {
    cachedMode = parseInboxListMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    cachedMode = DEFAULT_INBOX_LIST_MODE;
  }
  return cachedMode;
}

export function writeInboxListMode(mode: InboxListMode): void {
  const next = parseInboxListMode(mode);
  if (cachedMode === next) return;
  cachedMode = next;
  if (typeof window !== "undefined") {
    try {
      if (next === DEFAULT_INBOX_LIST_MODE) {
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
