import type { ChatMessage } from "@backsteros/contracts";

export function isOptimisticChatMessageId(id: string): boolean {
  return id.startsWith("local-");
}

export function createOptimisticOutgoingMessage(input: {
  conversationId: string;
  content: string;
}): ChatMessage {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    conversationId: input.conversationId,
    externalId: id,
    direction: "outgoing",
    content: input.content,
    contentType: "text",
    senderName: "You",
    private: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Upgrade a matching optimistic `local-*` bubble in place when the server echo
 * arrives, so send + SSE reload never flash as two bubbles. Keeps the
 * optimistic id as the React key to avoid a remount flicker.
 */
export function mergeIncomingChatMessage(
  current: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (current.some((row) => row.id === incoming.id)) {
    return current;
  }

  if (incoming.direction === "outgoing") {
    const optimisticIndex = current.findIndex(
      (row) =>
        isOptimisticChatMessageId(row.id) &&
        row.direction === "outgoing" &&
        row.content === incoming.content,
    );
    if (optimisticIndex >= 0) {
      const existing = current[optimisticIndex]!;
      const next = [...current];
      // Keep optimistic id as key; swap in server fields underneath.
      next[optimisticIndex] = {
        ...incoming,
        id: existing.id,
      };
      return next;
    }
  }

  return [...current, incoming];
}

/**
 * After a silent detail reload, keep any in-flight optimistic bubbles that the
 * server has not echoed yet.
 */
export function mergeChatMessageLists(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  if (current.length === 0) return incoming;

  const byId = new Map(incoming.map((row) => [row.id, row]));
  const merged = [...incoming];

  for (const row of current) {
    if (!isOptimisticChatMessageId(row.id)) continue;
    if (byId.has(row.id)) continue;
    const echoed = incoming.some(
      (candidate) =>
        candidate.direction === "outgoing" &&
        candidate.content === row.content &&
        !isOptimisticChatMessageId(candidate.id),
    );
    if (echoed) continue;
    merged.push(row);
  }

  return merged;
}

/** Replace an optimistic bubble with the confirmed server message. */
export function replaceOptimisticChatMessage(
  current: ChatMessage[],
  optimisticId: string,
  confirmed: ChatMessage,
): ChatMessage[] {
  const index = current.findIndex((row) => row.id === optimisticId);
  if (index < 0) {
    return mergeIncomingChatMessage(current, confirmed);
  }
  const next = [...current];
  // Keep the optimistic React key; update payload to the server message.
  next[index] = { ...confirmed, id: optimisticId };
  return next;
}

export function removeChatMessageById(
  current: ChatMessage[],
  messageId: string,
): ChatMessage[] {
  return current.filter((row) => row.id !== messageId);
}
