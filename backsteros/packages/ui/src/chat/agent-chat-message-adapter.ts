import type {
  ChatThreadMessage,
  ChatUiCardPart,
  ChatUiChoicesCardData,
  ChatUiMessage,
  ChatUiMessagePart,
} from "@backsteros/contracts";

export type ChatThreadMessageToUiOptions = {
  /** Unanswered choices superseded by a later typed user message. */
  dismissed?: boolean;
};

function choicesCardPart(
  message: ChatThreadMessage,
  dismissed: boolean,
): ChatUiCardPart | null {
  if (!message.choices) return null;
  const data: ChatUiChoicesCardData = {
    messageId: message.id,
    ...(message.choices.prompt ? { prompt: message.choices.prompt } : {}),
    multiSelect: message.choices.multiSelect,
    options: message.choices.options.map((option) => ({
      label: option.label,
      value: option.value,
      ...(option.style ? { style: option.style } : {}),
    })),
    answer: message.choicesAnswer ?? null,
    ...(dismissed ? { dismissed: true } : {}),
  };
  return {
    type: "card",
    cardType: "choices",
    id: `choices:${message.id}`,
    data,
  };
}

/** Map a persisted shell chat message into ChatThread's UI shape. */
export function chatThreadMessageToUi(
  message: ChatThreadMessage,
  options?: ChatThreadMessageToUiOptions,
): ChatUiMessage {
  const parts: ChatUiMessagePart[] = [
    { type: "text", text: message.body, markdown: true },
  ];
  const choices = choicesCardPart(message, options?.dismissed === true);
  if (choices) parts.push(choices);

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
    parts,
  };
}

/**
 * Map a thread snapshot, marking unanswered choice cards dismissed when a
 * later user message exists (typed reply without answering).
 */
export function chatThreadMessagesToUi(
  messages: readonly ChatThreadMessage[],
): ChatUiMessage[] {
  return messages.map((message, index) => {
    const dismissed =
      Boolean(message.choices) &&
      !message.choicesAnswer &&
      messages
        .slice(index + 1)
        .some((later) => later.role === "user");
    return chatThreadMessageToUi(message, { dismissed });
  });
}

/**
 * Recompute `dismissed` on existing UI messages (e.g. after a local send).
 */
export function withChoicesDismissedStates(
  messages: readonly ChatUiMessage[],
): ChatUiMessage[] {
  return messages.map((message, index) => {
    const partIndex = message.parts.findIndex(
      (part) => part.type === "card" && part.cardType === "choices",
    );
    if (partIndex < 0) return message;
    const part = message.parts[partIndex]!;
    if (part.type !== "card") return message;
    const data = (part.data ?? {}) as ChatUiChoicesCardData;
    if (data.answer) {
      if (!data.dismissed) return message;
      const nextParts = [...message.parts];
      nextParts[partIndex] = {
        ...part,
        data: { ...data, dismissed: false },
      };
      return { ...message, parts: nextParts };
    }
    const dismissed = messages
      .slice(index + 1)
      .some((later) => later.role === "user");
    if (Boolean(data.dismissed) === dismissed) return message;
    const nextParts = [...message.parts];
    nextParts[partIndex] = {
      ...part,
      data: { ...data, dismissed },
    };
    return { ...message, parts: nextParts };
  });
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
