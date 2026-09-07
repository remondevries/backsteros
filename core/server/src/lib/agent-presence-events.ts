/**
 * In-process fan-out for live agent-working presence → open shell SSE streams.
 * Heartbeats do not publish — only become-live and clear.
 */

export type AgentPresenceEvent = {
  workspaceId: string;
  taskId: string;
  /** true = agent started / resumed; false = cleared. */
  live: boolean;
};

type AgentPresenceListener = (event: AgentPresenceEvent) => void;

const listenersByWorkspace = new Map<string, Set<AgentPresenceListener>>();

export function subscribeAgentPresence(
  workspaceId: string,
  listener: AgentPresenceListener,
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

export function publishAgentPresence(event: AgentPresenceEvent): void {
  const set = listenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("agent.presence listener failed:", error);
    }
  }
}

/** Test helper — clear all subscribers. */
export function clearAgentPresenceListeners(): void {
  listenersByWorkspace.clear();
}
