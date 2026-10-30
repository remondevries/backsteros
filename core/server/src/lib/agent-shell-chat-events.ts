/**
 * In-process fan-out for shell agent DM replies → owner SSE streams on cloud-core.
 * Distinct from Chatwoot {@link publishChatUpdated} and outbound webhook payloads.
 */

export type AgentShellChatMessageEvent = {
  workspaceId: string;
  threadId: string;
  agentId: string;
  message: {
    id: string;
    /** Truncated plain preview for the sidebar card. */
    body: string;
    createdAt: string;
  };
};

/** SSE event name (also the outbound webhook event name — different transport). */
export const AGENT_SHELL_CHAT_SSE_EVENT = "agent.chat.message" as const;

type Listener = (event: AgentShellChatMessageEvent) => void;

const listenersByWorkspace = new Map<string, Set<Listener>>();

export function previewAgentChatMessageBody(body: string, max = 96): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "New message";
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function subscribeAgentShellChatMessage(
  workspaceId: string,
  listener: Listener,
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

export function publishAgentShellChatMessage(
  event: AgentShellChatMessageEvent,
): void {
  const set = listenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("agent.chat.message listener failed:", error);
    }
  }
}

/** Test helper — clear all subscribers. */
export function clearAgentShellChatMessageListeners(): void {
  listenersByWorkspace.clear();
}
