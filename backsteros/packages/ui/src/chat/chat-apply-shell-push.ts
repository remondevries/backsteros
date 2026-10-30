import type { ChatUiMessage } from "@backsteros/contracts";

export type ShellChatMessagePush = {
  id: string;
  body: string;
  createdAt: string;
};

function stripThinking(messages: readonly ChatUiMessage[]): ChatUiMessage[] {
  return messages.filter((message) => !message.id.startsWith("thinking-"));
}

/**
 * Merge an `agent.chat.message` SSE payload into the open thread body and
 * drop any thinking status line.
 */
export function applyAssistantShellChatPush(
  previous: readonly ChatUiMessage[] | null | undefined,
  push: ShellChatMessagePush,
  agentName: string,
): ChatUiMessage[] {
  const base = stripThinking(previous ?? []);
  if (base.some((message) => message.id === push.id)) {
    return base;
  }
  return [
    ...base,
    {
      id: push.id,
      role: "assistant",
      author: { name: agentName },
      status: "done",
      createdAt: push.createdAt,
      parts: [{ type: "text", text: push.body, markdown: true }],
    },
  ];
}
