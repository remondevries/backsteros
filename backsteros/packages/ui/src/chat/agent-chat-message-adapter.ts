import type { ChatThreadMessage, ChatUiMessage } from "@backsteros/contracts";

/** Map a persisted shell chat message into ChatThread's UI shape. */
export function chatThreadMessageToUi(
  message: ChatThreadMessage,
): ChatUiMessage {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    createdAt: message.createdAt,
    author: message.authorName
      ? {
          id: message.authorContactId ?? undefined,
          name: message.authorName,
        }
      : message.authorContactId
        ? { id: message.authorContactId }
        : undefined,
    parts: [{ type: "text", text: message.body, markdown: true }],
  };
}

/**
 * Status-line while the agent is working.
 * Prefer an explicit step `label`; otherwise “{name} is thinking…”.
 */
export function thinkingStatusMessage(
  agentName: string,
  options?: { label?: string | null; id?: string },
): ChatUiMessage {
  const label = options?.label?.trim() || "";
  const text = label.length > 0 ? label : `${agentName} is thinking…`;
  return {
    id: options?.id ?? `thinking-${agentName}`,
    role: "system",
    status: "streaming",
    createdAt: new Date().toISOString(),
    parts: [
      {
        type: "status-line",
        text,
      },
    ],
  };
}

export function webhookErrorStatusMessage(
  error: string,
  id = `webhook-error-${Date.now()}`,
): ChatUiMessage {
  return {
    id,
    role: "system",
    status: "error",
    createdAt: new Date().toISOString(),
    parts: [{ type: "status-line", text: error }],
  };
}
