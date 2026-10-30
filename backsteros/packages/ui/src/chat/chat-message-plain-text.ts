import type { ChatUiMessage, ChatUiMessagePart } from "@backsteros/contracts";

function partPlainText(part: ChatUiMessagePart): string {
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
      return part.cardType;
    default:
      return "";
  }
}

/** Flatten a chat UI message to clipboard-friendly plain text. */
export function chatMessagePlainText(message: ChatUiMessage): string {
  return message.parts
    .map(partPlainText)
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}
