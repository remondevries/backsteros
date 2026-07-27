import type { AgentChatMessage } from "./agent-chat-transcript";

export type AgentChatTurnPair = {
  /** Stable id = user message id (or assistant-only id). */
  turnId: string;
  user: AgentChatMessage | null;
  assistant: AgentChatMessage | null;
  /** Inclusive index range in the flat messages array. */
  startIndex: number;
  endIndex: number;
};

/** Pair consecutive user → assistant messages into turns (T3-style). */
export function pairAgentChatTurns(
  messages: readonly AgentChatMessage[],
): AgentChatTurnPair[] {
  const turns: AgentChatTurnPair[] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index]!;
    if (message.role === "user") {
      const next = messages[index + 1];
      if (next?.role === "assistant") {
        turns.push({
          turnId: message.id,
          user: message,
          assistant: next,
          startIndex: index,
          endIndex: index + 1,
        });
        index += 2;
        continue;
      }
      turns.push({
        turnId: message.id,
        user: message,
        assistant: null,
        startIndex: index,
        endIndex: index,
      });
      index += 1;
      continue;
    }
    turns.push({
      turnId: message.id,
      user: null,
      assistant: message,
      startIndex: index,
      endIndex: index,
    });
    index += 1;
  }
  return turns;
}
