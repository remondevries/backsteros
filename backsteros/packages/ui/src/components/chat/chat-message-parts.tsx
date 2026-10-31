"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  ChatUiCardPart,
  ChatUiMessage,
  ChatUiMessagePart,
} from "@backsteros/contracts";

import { chatMessagePlainText } from "../../chat/chat-message-plain-text.js";
import {
  belowCardMentionTokensInMessage,
  chatMessageBubbleParts,
  collectChatMentionCardsBelow,
  mentionDedupeKey,
} from "../../chat/chat-mention-layout.js";
import { useChatMentionResolveOptional } from "../../chat/chat-mention-resolve-context.js";
import { isChatMessageSelectable } from "../../chat/chat-select-mode.js";
import {
  useMentionCatalogOptional,
  useResolveMentionTokensInContent,
} from "../../mentions/mention-catalog-context.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { AlertTriangleIcon } from "../icons/alert-triangle-icon.js";
import { TerminalConsoleIcon } from "../icons/terminal-console-icon.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { TaskStatusWorkingPulse } from "../tasks/task-status-working-pulse.js";
import { ChatCardPartView } from "./chat-card-registry.js";
import {
  ChatAttachmentsCard,
  findAttachmentsCardPart,
} from "./chat-attachments-card.js";
import {
  ChatApprovalCard,
  findApprovalCardPart,
} from "./chat-approval-card.js";
import {
  ChatChoicesCard,
  findChoicesCardPart,
} from "./chat-choices-card.js";
import {
  ChatFormCard,
  findFormCardPart,
} from "./chat-form-card.js";
import {
  ChatProgressCard,
  findProgressCardPart,
} from "./chat-progress-card.js";
import {
  ChatLinkPreviewsCard,
  findLinkPreviewsCardPart,
} from "./chat-link-previews-card.js";
import { ChatMessageHoverActions } from "./chat-message-hover-actions.js";

function formatJson(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ChatToolCallStatusMark({
  status,
}: {
  status: NonNullable<Extract<ChatUiMessagePart, { type: "tool-call" }>["status"]>;
}) {
  switch (status) {
    case "pending":
      // Backlog circle — queued, not started.
      return (
        <TaskStatusIcon
          status="backlog"
          size={14}
          className="chat-ui-tool-call__status-icon"
          title="Pending"
        />
      );
    case "running":
      // Yellow animated in-progress pulse.
      return (
        <TaskStatusWorkingPulse
          size={14}
          compact
          className="chat-ui-tool-call__status-icon"
          aria-label="Running"
        />
      );
    case "done":
      // Green completed check.
      return (
        <TaskStatusIcon
          status="completed"
          size={14}
          className="chat-ui-tool-call__status-icon"
          title="Done"
        />
      );
    case "error":
      return (
        <AlertTriangleIcon
          size={14}
          className="chat-ui-tool-call__status-icon chat-ui-tool-call__status-icon--error"
          aria-label="Error"
        />
      );
    default:
      return null;
  }
}

function ChatToolCallPartView({
  part,
}: {
  part: Extract<ChatUiMessagePart, { type: "tool-call" }>;
}) {
  const [open, setOpen] = useState(part.status === "error");
  const status = part.status ?? "done";
  return (
    <details
      className={`chat-ui-tool-call is-${status}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="chat-ui-tool-call__summary">
        <span className="chat-ui-tool-call__lead">
          <TerminalConsoleIcon
            size={14}
            className="chat-ui-tool-call__icon"
          />
          <span className="chat-ui-tool-call__name">{part.name}</span>
        </span>
        <ChatToolCallStatusMark status={status} />
      </summary>
      <div className="chat-ui-tool-call__body">
        {part.input !== undefined ? (
          <pre className="chat-ui-tool-call__block">
            <span className="chat-ui-tool-call__label">Input</span>
            {formatJson(part.input)}
          </pre>
        ) : null}
        {part.output !== undefined ? (
          <pre className="chat-ui-tool-call__block">
            <span className="chat-ui-tool-call__label">Output</span>
            {formatJson(part.output)}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function ChatTextPartView({
  part,
}: {
  part: Extract<ChatUiMessagePart, { type: "text" }>;
}) {
  // Mention-aware preview. Task tokens that already have a below-card are
  // stripped before we get here — remaining mentions stay inline chips.
  if (part.markdown || /\[@[a-z]+:/i.test(part.text)) {
    return (
      <div className="chat-ui-text chat-ui-text--markdown">
        <DocumentMarkdownPreview body={part.text} forceInlineMentions />
      </div>
    );
  }
  return <div className="chat-ui-text">{part.text}</div>;
}

export function ChatUiPartView({
  part,
  liveShine = false,
}: {
  part: ChatUiMessagePart;
  /** Agent working / Thinking… — reuse shell `live-status-shine` shimmer. */
  liveShine?: boolean;
}): ReactNode {
  switch (part.type) {
    case "text":
      return <ChatTextPartView part={part} />;
    case "file":
      if (part.kind === "image" || part.mimeType?.startsWith("image/")) {
        return (
          <img
            className="chat-ui-image"
            src={part.url}
            alt={part.name ?? "Attachment"}
          />
        );
      }
      return (
        <a className="chat-ui-file" href={part.url} target="_blank" rel="noreferrer">
          {part.name ?? part.url}
        </a>
      );
    case "tool-call":
      return <ChatToolCallPartView part={part} />;
    case "diff":
      return (
        <pre className="chat-ui-diff">
          {part.filename ? (
            <span className="chat-ui-diff__filename">{part.filename}</span>
          ) : null}
          {part.content}
        </pre>
      );
    case "status-line":
      return (
        <div
          className={
            liveShine
              ? "chat-ui-status-line live-status-shine"
              : "chat-ui-status-line"
          }
        >
          {part.text}
        </div>
      );
    case "error":
      return (
        <div className="chat-ui-error" role="alert">
          {part.code ? <code>{part.code}</code> : null}
          <span>{part.message}</span>
        </div>
      );
    case "approval-request":
      return (
        <div className="chat-ui-approval">
          <strong>{part.title}</strong>
          {part.description ? <p>{part.description}</p> : null}
        </div>
      );
    case "card":
      return <ChatCardPartView part={part} />;
    default:
      return null;
  }
}

export type ChatUiMessageBodyProps = {
  message: ChatUiMessage;
  /** Soft-delete this message (owner). Opens the shared delete modal from hover. */
  onDelete?: ((messageId: string) => void | Promise<void>) | null;
  /** Multi-select delete mode. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: ((messageId: string) => void) | null;
};

export function ChatUiMessageBody({
  message,
  onDelete = null,
  selectMode = false,
  selected = false,
  onToggleSelect = null,
}: ChatUiMessageBodyProps) {
  const mentionCatalog = useMentionCatalogOptional()?.catalog ?? null;
  const mentionResolve = useChatMentionResolveOptional();
  const belowTokens = useMemo(
    () => belowCardMentionTokensInMessage(message),
    [message],
  );
  useResolveMentionTokensInContent(belowTokens);

  // After a short beat, unresolved stubs flip from "Looking up…" to
  // "… not found" so a cold catalog does not stay on a spinner forever.
  const [lookupSettled, setLookupSettled] = useState(belowTokens.length === 0);
  useEffect(() => {
    if (belowTokens.length === 0) {
      setLookupSettled(true);
      return;
    }
    setLookupSettled(false);
    const handle = window.setTimeout(() => setLookupSettled(true), 500);
    return () => window.clearTimeout(handle);
  }, [message.id, belowTokens]);

  const resolvedByKey = useMemo(() => {
    if (!mentionResolve || belowTokens.length === 0) return null;
    const map = new Map<string, ChatUiCardPart>();
    for (const token of belowTokens) {
      const key = mentionDedupeKey(token);
      if (!key) continue;
      const part = mentionResolve.resolveByKey(key);
      if (part) map.set(key, part);
    }
    return map.size > 0 ? map : null;
  }, [mentionResolve, belowTokens]);

  const mentionCardsBelow = useMemo(
    () =>
      collectChatMentionCardsBelow(message, {
        catalog: mentionCatalog,
        resolvedByKey,
        lookingUp: !lookupSettled,
      }),
    [lookupSettled, mentionCatalog, message, resolvedByKey],
  );
  const stripMentionKeys = useMemo(() => {
    if (mentionCardsBelow.length === 0) return null;
    return new Set(mentionCardsBelow.map((entry) => entry.key));
  }, [mentionCardsBelow]);
  const choicesPart = useMemo(
    () => findChoicesCardPart(message.parts),
    [message.parts],
  );
  const approvalPart = useMemo(
    () => findApprovalCardPart(message.parts),
    [message.parts],
  );
  const formPart = useMemo(
    () => findFormCardPart(message.parts),
    [message.parts],
  );
  const progressPart = useMemo(
    () => findProgressCardPart(message.parts),
    [message.parts],
  );
  const attachmentsPart = useMemo(
    () => findAttachmentsCardPart(message.parts),
    [message.parts],
  );
  const linkPreviewsPart = useMemo(
    () => findLinkPreviewsCardPart(message.parts),
    [message.parts],
  );
  const bubbleParts = useMemo(
    () =>
      chatMessageBubbleParts(message.parts, {
        stripMentionKeys,
      }),
    [message.parts, stripMentionKeys],
  );

  const isStatusOnly =
    message.role === "system" ||
    (message.parts.length === 1 && message.parts[0]?.type === "status-line");

  if (isStatusOnly) {
    // Thinking / step-label rows use status "streaming"; static system lines do not.
    const liveShine = message.status === "streaming";
    return (
      <div className="chat-ui-message is-system" data-message-id={message.id}>
        {message.parts.map((part, index) => (
          <ChatUiPartView
            key={`${message.id}-${index}`}
            part={part}
            liveShine={liveShine && part.type === "status-line"}
          />
        ))}
      </div>
    );
  }

  // T3 Code pattern: user stays a bubble; assistant replies sit flat on the
  // thread background (no bubble chrome).
  const isAssistant = message.role === "assistant";
  const bodyClass = isAssistant
    ? "chat-ui-message__body"
    : "chat-ui-message__bubble";
  const selectable = selectMode && isChatMessageSelectable(message.role);
  const statusLabel =
    message.status === "pending"
      ? "Sending…"
      : message.status === "streaming"
        ? "Streaming…"
        : null;
  const plainText = chatMessagePlainText(message);

  const toggleSelect = () => {
    onToggleSelect?.(message.id);
  };

  return (
    <div
      className={[
        "chat-ui-message",
        isAssistant ? "is-assistant" : "is-user",
        message.status === "pending" ? "is-pending" : "",
        message.status === "streaming" ? "is-streaming" : "",
        message.status === "error" ? "is-error" : "",
        selectMode ? "is-select-mode" : "",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={message.id}
      data-role={message.role}
      data-status={message.status}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
      onClick={selectable ? toggleSelect : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggleSelect();
            }
          : undefined
      }
    >
      {selectable ? (
        <div className="chat-ui-message__select">
          <PolishedCheckbox
            checked={selected}
            ariaLabel={`Select message from ${message.author?.name ?? message.role}`}
            onCheckedChange={toggleSelect}
          />
        </div>
      ) : null}
      <div className="chat-ui-message__main">
        {bubbleParts.length > 0 ? (
          <div className={bodyClass}>
            {bubbleParts.map((part, index) => (
              <ChatUiPartView key={`${message.id}-${index}`} part={part} />
            ))}
          </div>
        ) : null}
        {!selectMode ? (
          <ChatMessageHoverActions
            plainText={plainText}
            createdAt={message.createdAt}
            statusLabel={statusLabel}
            ownMessage={!isAssistant}
            onDelete={
              onDelete ? () => onDelete(message.id) : null
            }
          />
        ) : null}
        {mentionCardsBelow.length > 0 ? (
          <div className="chat-ui-message__task-cards">
            {mentionCardsBelow.map((entry) => (
              <ChatCardPartView key={entry.key} part={entry.part} />
            ))}
          </div>
        ) : null}
        {attachmentsPart ? (
          <ChatAttachmentsCard part={attachmentsPart} />
        ) : null}
        {linkPreviewsPart ? (
          <ChatLinkPreviewsCard part={linkPreviewsPart} />
        ) : null}
        {progressPart ? <ChatProgressCard part={progressPart} /> : null}
        {choicesPart ? <ChatChoicesCard part={choicesPart} /> : null}
        {approvalPart ? <ChatApprovalCard part={approvalPart} /> : null}
        {formPart ? <ChatFormCard part={formPart} /> : null}
      </div>
    </div>
  );
}
