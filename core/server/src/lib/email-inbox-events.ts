/**
 * In-process fan-out for AgentMail inbound events → open shell SSE streams.
 */

export type EmailUpdatedEvent = {
  workspaceId: string;
  inboxId: string;
  messageId: string | null;
};

type EmailUpdatedListener = (event: EmailUpdatedEvent) => void;

const listenersByWorkspace = new Map<string, Set<EmailUpdatedListener>>();

export function subscribeEmailUpdated(
  workspaceId: string,
  listener: EmailUpdatedListener,
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

export function publishEmailUpdated(event: EmailUpdatedEvent): void {
  const set = listenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("email.updated listener failed:", error);
    }
  }
}

/** Test helper — clear all subscribers. */
export function clearEmailUpdatedListeners(): void {
  listenersByWorkspace.clear();
}
