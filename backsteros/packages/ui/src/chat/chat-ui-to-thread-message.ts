/**
 * Convert shared ChatUiMessage → assistant-ui ThreadMessageLike for
 * ExternalStoreRuntime. Custom parts use data-* content + metadata.custom.
 */
import type {
  ChatUiMessage,
  ChatUiMessagePart,
  ChatUiMessageStatus,
} from "@backsteros/contracts";
import type { MessageStatus, ThreadMessageLike } from "@assistant-ui/react";

function mapStatus(status: ChatUiMessageStatus): MessageStatus | undefined {
  switch (status) {
    case "pending":
    case "streaming":
      return { type: "running" };
    case "error":
      return { type: "incomplete", reason: "error" };
    case "done":
      return { type: "complete", reason: "stop" };
    default:
      return undefined;
  }
}

function partToThreadContent(
  part: ChatUiMessagePart,
): NonNullable<Exclude<ThreadMessageLike["content"], string>>[number] | null {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "file":
      if (part.kind === "image" || part.mimeType?.startsWith("image/")) {
        return { type: "image", image: part.url };
      }
      return {
        type: "file",
        data: part.url,
        mimeType: part.mimeType ?? "application/octet-stream",
        filename: part.name,
      };
    case "tool-call": {
      const args =
        part.input && typeof part.input === "object" && !Array.isArray(part.input)
          ? (part.input as Record<string, never>)
          : ({ value: part.input as never } as Record<string, never>);
      return {
        type: "tool-call",
        toolCallId: part.id ?? part.name,
        toolName: part.name,
        args,
        result: part.output,
        isError: part.status === "error",
      };
    }
    case "diff":
      return { type: "data-diff", data: part };
    case "status-line":
      return { type: "data-status-line", data: part };
    case "error":
      return { type: "data-error", data: part };
    case "approval-request":
      return { type: "data-approval-request", data: part };
    case "card":
      return { type: "data-card", data: part };
    default:
      return null;
  }
}

/** Flatten ChatUi parts into a single text string for system ThreadMessageLike. */
function systemTextFromParts(parts: readonly ChatUiMessagePart[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    switch (part.type) {
      case "text":
      case "status-line":
        chunks.push(part.text);
        break;
      case "error":
        chunks.push(part.message);
        break;
      default:
        break;
    }
  }
  return chunks.join("\n").trim() || " ";
}

/** Build a ThreadMessageLike that preserves the full ChatUiMessage in metadata. */
export function chatUiMessageToThreadMessageLike(
  message: ChatUiMessage,
): ThreadMessageLike {
  // assistant-ui constraints:
  // - `status` / `metadata.steps` only on assistant
  // - system messages must be exactly one text part
  // Our ChatThread still renders from metadata.custom.chatUi.
  if (message.role === "system") {
    return {
      id: message.id,
      role: "system",
      content: [{ type: "text", text: systemTextFromParts(message.parts) }],
      createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
      metadata: {
        custom: {
          chatUi: message,
          author: message.author ?? null,
        },
      },
    };
  }

  const content = message.parts
    .map(partToThreadContent)
    .filter((part): part is NonNullable<typeof part> => part != null);

  const status =
    message.role === "assistant" ? mapStatus(message.status) : undefined;

  return {
    id: message.id,
    role: message.role,
    content:
      content.length > 0
        ? content
        : [{ type: "text", text: "" }],
    createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
    ...(status ? { status } : {}),
    metadata: {
      custom: {
        chatUi: message,
        author: message.author ?? null,
      },
      isOptimistic: message.status === "pending" ? true : undefined,
    },
  };
}
