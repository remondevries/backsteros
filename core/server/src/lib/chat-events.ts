/**
 * In-process fan-out for Chatwoot mirror updates → open shell SSE streams.
 */

export type ChatUpdatedEvent = {
  workspaceId: string;
  conversationId: string;
  messageId: string | null;
  kind: "message" | "conversation";
};

type ChatUpdatedListener = (event: ChatUpdatedEvent) => void;

const listenersByWorkspace = new Map<string, Set<ChatUpdatedListener>>();

export function subscribeChatUpdated(
  workspaceId: string,
  listener: ChatUpdatedListener,
): () => void {
  const id = workspaceId.trim();
  if (!id) return () => {};
  let set = listenersByWorkspace.get(id);
  if (!set) {
    set = new Set();
    listenersByWorkspace.set(id, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listenersByWorkspace.delete(id);
  };
}

export function publishChatUpdated(event: ChatUpdatedEvent): void {
  const set = listenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("chat.updated listener failed:", error);
    }
  }
}

/** Test helper — clear all subscribers. */
export function clearChatUpdatedListeners(): void {
  listenersByWorkspace.clear();
}
