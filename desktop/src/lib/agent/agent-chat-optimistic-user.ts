/**
 * T3-style optimistic user messages.
 *
 * T3 keeps outgoing user rows in a separate list and concatenates them onto
 * the server transcript until the server ack arrives (same message id). That
 * way sync/persist races cannot hide the prompt the user just sent.
 */

import type { AgentChatMessage } from "./agent-chat-transcript";

const FUZZY_ACK_WINDOW_MS = 60_000;

function findFuzzyUserAck(
  optimistic: AgentChatMessage,
  messages: readonly AgentChatMessage[],
  consumedMessageIds: ReadonlySet<string>,
): AgentChatMessage | null {
  for (const entry of messages) {
    if (entry.role !== "user") continue;
    if (consumedMessageIds.has(entry.id)) continue;
    if (entry.text !== optimistic.text) continue;
    if (Math.abs(entry.createdAt - optimistic.createdAt) >= FUZZY_ACK_WINDOW_MS) {
      continue;
    }
    return entry;
  }
  return null;
}

/** Display transcript = persisted messages + optimistic users not yet acked. */
export function mergeDisplayMessagesWithOptimisticUsers(
  messages: readonly AgentChatMessage[],
  optimisticUsers: readonly AgentChatMessage[],
): AgentChatMessage[] {
  if (optimisticUsers.length === 0) {
    return messages as AgentChatMessage[];
  }
  const ids = new Set(messages.map((message) => message.id));
  const fuzzyConsumed = new Set<string>();
  const pending: AgentChatMessage[] = [];
  for (const message of optimisticUsers) {
    if (message.role !== "user") continue;
    if (ids.has(message.id)) continue;
    // Sidecar may mint a different id — consume at most one persisted user
    // per optimistic row so rapid duplicate prompts still show.
    const ack = findFuzzyUserAck(message, messages, fuzzyConsumed);
    if (ack) {
      fuzzyConsumed.add(ack.id);
      continue;
    }
    pending.push(message);
  }
  if (pending.length === 0) {
    return messages as AgentChatMessage[];
  }
  return [...messages, ...pending];
}

/** Drop optimistic rows once the persisted transcript contains them. */
export function pruneOptimisticUserMessages(
  optimisticUsers: readonly AgentChatMessage[],
  messages: readonly AgentChatMessage[],
): AgentChatMessage[] {
  if (optimisticUsers.length === 0) {
    return optimisticUsers as AgentChatMessage[];
  }
  const ids = new Set(messages.map((message) => message.id));
  const fuzzyConsumed = new Set<string>();
  const next = optimisticUsers.filter((message) => {
    if (ids.has(message.id)) return false;
    const ack = findFuzzyUserAck(message, messages, fuzzyConsumed);
    if (ack) {
      fuzzyConsumed.add(ack.id);
      return false;
    }
    return true;
  });
  return next.length === optimisticUsers.length
    ? (optimisticUsers as AgentChatMessage[])
    : next;
}
