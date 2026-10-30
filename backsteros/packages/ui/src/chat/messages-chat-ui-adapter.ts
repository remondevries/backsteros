/**
 * Maps existing Messages (Chatwoot-shaped) conversation messages into the
 * shared ChatUiMessage format used by ChatThread.
 */
import type { ChatMessage, ChatUiMessage } from "@backsteros/contracts";

function isOptimisticMessage(message: ChatMessage): boolean {
  return message.id.startsWith("local-");
}

/**
 * Convert one Chatwoot/Messages `ChatMessage` into a `ChatUiMessage`.
 *
 * - `incoming` → user (contact)
 * - `outgoing` → assistant (agent / us) — keeps bubbles on the “our side”
 * - `activity` → system + status-line part
 */
export function chatMessageToChatUiMessage(
  message: ChatMessage,
): ChatUiMessage {
  const pending = isOptimisticMessage(message);
  const body = message.content || (message.private ? "(private note)" : "");

  if (message.direction === "activity") {
    return {
      id: message.id,
      role: "system",
      author: message.senderName
        ? { name: message.senderName }
        : undefined,
      status: pending ? "pending" : "done",
      createdAt: message.createdAt,
      parts: [{ type: "status-line", text: body }],
    };
  }

  const role = message.direction === "incoming" ? "user" : "assistant";
  return {
    id: message.id,
    role,
    author: message.senderName ? { name: message.senderName } : undefined,
    status: pending ? "pending" : "done",
    createdAt: message.createdAt,
    parts: [{ type: "text", text: body }],
  };
}

/** Map a Messages conversation detail thread into ChatUi messages. */
export function chatMessagesToChatUiMessages(
  messages: readonly ChatMessage[],
): ChatUiMessage[] {
  return messages.map(chatMessageToChatUiMessage);
}
