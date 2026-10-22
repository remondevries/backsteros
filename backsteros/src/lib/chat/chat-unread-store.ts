import { useSyncExternalStore } from "react";

/**
 * Cross-pane unread count for Communication → Chat.
 * `useChatInbox` publishes; the side panel (and list header) subscribe.
 */
let unreadCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setChatUnreadCount(next: number): void {
  const normalized = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
  if (normalized === unreadCount) return;
  unreadCount = normalized;
  emit();
}

export function getChatUnreadCount(): number {
  return unreadCount;
}

export function subscribeChatUnreadCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatUnreadCount(): number {
  return useSyncExternalStore(
    subscribeChatUnreadCount,
    getChatUnreadCount,
    () => 0,
  );
}
