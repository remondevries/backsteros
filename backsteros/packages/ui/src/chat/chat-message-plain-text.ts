import type { ChatUiMessage, ChatUiMessagePart } from "@backsteros/contracts";

import { taskCardPlainText } from "./chat-task-mention-layout.js";

function partPlainText(
  part: ChatUiMessagePart,
  textBodies: string,
): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "status-line":
      return part.text;
    case "error":
      return part.message;
    case "diff":
      return part.content;
    case "file":
      return part.name ?? part.url;
    case "tool-call":
      return part.name;
    case "approval-request":
      return part.title;
    case "card":
      // Task cards are display-only below the bubble. Prefer the raw
      // `[@task:…]` already in text; only emit a token for card-only rows.
      if (part.cardType === "task") {
        const token = taskCardPlainText(part);
        if (!token) return "";
        if (textBodies.includes(token)) return "";
        return token;
      }
      return part.cardType;
    default:
      return "";
  }
}

/** Flatten a chat UI message to clipboard-friendly plain text. */
export function chatMessagePlainText(message: ChatUiMessage): string {
  const textBodies = message.parts
    .filter(
      (part): part is Extract<ChatUiMessagePart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");

  return message.parts
    .map((part) => partPlainText(part, textBodies))
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}
