"use client";

import { useState, type ReactNode } from "react";
import type { ChatUiMessage, ChatUiMessagePart } from "@backsteros/contracts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AlertTriangleIcon } from "../icons/alert-triangle-icon.js";
import { TerminalConsoleIcon } from "../icons/terminal-console-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { TaskStatusWorkingPulse } from "../tasks/task-status-working-pulse.js";
import { ChatCardPartView } from "./chat-card-registry.js";

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
  if (part.markdown) {
    return (
      <div className="chat-ui-text chat-ui-text--markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
      </div>
    );
  }
  return <div className="chat-ui-text">{part.text}</div>;
}

export function ChatUiPartView({ part }: { part: ChatUiMessagePart }): ReactNode {
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
      return <div className="chat-ui-status-line">{part.text}</div>;
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

export function ChatUiMessageBody({ message }: { message: ChatUiMessage }) {
  const isStatusOnly =
    message.role === "system" ||
    (message.parts.length === 1 && message.parts[0]?.type === "status-line");

  if (isStatusOnly) {
    return (
      <div className="chat-ui-message is-system" data-message-id={message.id}>
        {message.parts.map((part, index) => (
          <ChatUiPartView key={`${message.id}-${index}`} part={part} />
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

  return (
    <div
      className={[
        "chat-ui-message",
        isAssistant ? "is-assistant" : "is-user",
        message.status === "pending" ? "is-pending" : "",
        message.status === "streaming" ? "is-streaming" : "",
        message.status === "error" ? "is-error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={message.id}
      data-role={message.role}
      data-status={message.status}
    >
      {message.author?.name ? (
        <div className="chat-ui-message__author">{message.author.name}</div>
      ) : null}
      <div className={bodyClass}>
        {message.parts.map((part, index) => (
          <ChatUiPartView key={`${message.id}-${index}`} part={part} />
        ))}
      </div>
      {message.status === "pending" ? (
        <time className="chat-ui-message__timestamp">Sending…</time>
      ) : message.status === "streaming" ? (
        <time className="chat-ui-message__timestamp">Streaming…</time>
      ) : !isAssistant && message.createdAt ? (
        <time className="chat-ui-message__timestamp" dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      ) : null}
    </div>
  );
}
