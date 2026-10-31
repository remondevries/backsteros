"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatUiCardPart,
  ChatUiEmailDraftCardData,
} from "@backsteros/contracts";
import { chatUiEmailDraftCardDataSchema } from "@backsteros/contracts";

import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";

export type ChatEmailDraftEdits = {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
};

export type ChatEmailDraftAnswerFn = (
  messageId: string,
  emailAction: "send" | "discard",
  edits?: ChatEmailDraftEdits,
) => void | Promise<void>;

const ChatEmailDraftAnswerContext =
  createContext<ChatEmailDraftAnswerFn | null>(null);

export function ChatEmailDraftAnswerProvider({
  onAnswer,
  children,
}: {
  onAnswer?: ChatEmailDraftAnswerFn | null;
  children: ReactNode;
}) {
  return (
    <ChatEmailDraftAnswerContext.Provider value={onAnswer ?? null}>
      {children}
    </ChatEmailDraftAnswerContext.Provider>
  );
}

export function useChatEmailDraftAnswerOptional(): ChatEmailDraftAnswerFn | null {
  return useContext(ChatEmailDraftAnswerContext);
}

function parseData(part: ChatUiCardPart): ChatUiEmailDraftCardData | null {
  const parsed = chatUiEmailDraftCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function formatAnsweredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recipientLabel(r: {
  email: string;
  name?: string | null;
}): string {
  return r.name?.trim() ? `${r.name.trim()} <${r.email}>` : r.email;
}

function parseAddressList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const BODY_COLLAPSE_CHARS = 600;

export function ChatEmailDraftCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseData(part), [part]);
  const onAnswer = useChatEmailDraftAnswerOptional();
  const [editing, setEditing] = useState(false);
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locked = Boolean(data?.result) || data?.dismissed === true;

  const startEdit = useCallback(() => {
    if (!data || locked) return;
    setToText(data.to.map((r) => r.email).join(", "));
    setCcText((data.cc ?? []).map((r) => r.email).join(", "));
    setSubject(data.subject);
    setBody(data.body);
    setEditing(true);
    setError(null);
  }, [data, locked]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const runAction = useCallback(
    async (emailAction: "send" | "discard") => {
      if (!data || !onAnswer || submitting || locked) return;
      setSubmitting(true);
      setError(null);
      try {
        const edits =
          emailAction === "send" && editing
            ? {
                to: parseAddressList(toText),
                ...(parseAddressList(ccText).length > 0
                  ? { cc: parseAddressList(ccText) }
                  : { cc: [] as string[] }),
                subject: subject.trim(),
                body,
              }
            : undefined;
        if (edits && edits.to.length === 0) {
          setError("At least one To recipient is required");
          return;
        }
        await onAnswer(data.messageId, emailAction, edits);
        setEditing(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not complete email action",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      body,
      ccText,
      data,
      editing,
      locked,
      onAnswer,
      subject,
      submitting,
      toText,
    ],
  );

  if (!data) return null;

  const result = data.result;
  const displayTo = result?.finalTo ?? data.to;
  const displaySubject = result?.finalSubject ?? data.subject;
  const displayBody = result?.finalBody ?? data.body;
  const fromLabel = data.from
    ? data.from.displayName?.trim()
      ? `${data.from.displayName.trim()} <${data.from.email}>`
      : data.from.email
    : null;
  const longBody = displayBody.length > BODY_COLLAPSE_CHARS;
  const shownBody =
    !expanded && longBody && !editing
      ? `${displayBody.slice(0, BODY_COLLAPSE_CHARS).trimEnd()}…`
      : displayBody;

  const conversationHref = result?.conversationId
    ? `/messages?conversation=${encodeURIComponent(result.conversationId)}`
    : null;

  return (
    <div
      className={[
        "chat-ui-email-draft-card",
        data.dismissed ? "is-dismissed" : "",
        result ? "is-answered" : "",
        submitting ? "is-submitting" : "",
        editing ? "is-editing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
    >
      {data.note ? (
        <p className="chat-ui-email-draft-card__note">{data.note}</p>
      ) : null}

      <div className="chat-ui-email-draft-card__headers">
        {fromLabel ? (
          <div className="chat-ui-email-draft-card__row">
            <span className="chat-ui-email-draft-card__label">From</span>
            <span className="chat-ui-email-draft-card__value">{fromLabel}</span>
          </div>
        ) : null}
        <div className="chat-ui-email-draft-card__row">
          <span className="chat-ui-email-draft-card__label">To</span>
          {editing ? (
            <input
              className="chat-ui-email-draft-card__control"
              value={toText}
              disabled={submitting}
              onChange={(event) => setToText(event.target.value)}
            />
          ) : (
            <span className="chat-ui-email-draft-card__chips">
              {displayTo.map((r) => (
                <span key={r.email} className="chat-ui-email-draft-card__chip">
                  {recipientLabel(r)}
                </span>
              ))}
            </span>
          )}
        </div>
        {(editing || (data.cc && data.cc.length > 0)) && (
          <div className="chat-ui-email-draft-card__row">
            <span className="chat-ui-email-draft-card__label">Cc</span>
            {editing ? (
              <input
                className="chat-ui-email-draft-card__control"
                value={ccText}
                disabled={submitting}
                onChange={(event) => setCcText(event.target.value)}
              />
            ) : (
              <span className="chat-ui-email-draft-card__chips">
                {(data.cc ?? []).map((r) => (
                  <span key={r.email} className="chat-ui-email-draft-card__chip">
                    {recipientLabel(r)}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="chat-ui-email-draft-card__row">
          <span className="chat-ui-email-draft-card__label">Subject</span>
          {editing ? (
            <input
              className="chat-ui-email-draft-card__control"
              value={subject}
              disabled={submitting}
              onChange={(event) => setSubject(event.target.value)}
            />
          ) : (
            <span className="chat-ui-email-draft-card__value is-subject">
              {displaySubject}
            </span>
          )}
        </div>
      </div>

      <div className="chat-ui-email-draft-card__body">
        {editing ? (
          <textarea
            className="chat-ui-email-draft-card__textarea"
            rows={10}
            value={body}
            disabled={submitting}
            onChange={(event) => setBody(event.target.value)}
          />
        ) : (
          <DocumentMarkdownPreview body={shownBody} forceInlineMentions />
        )}
        {!editing && longBody ? (
          <button
            type="button"
            className="chat-ui-email-draft-card__expand"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>

      {data.attachments && data.attachments.length > 0 ? (
        <ul className="chat-ui-email-draft-card__attachments">
          {data.attachments.map((item) => (
            <li key={item.id}>{item.filename}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="chat-ui-email-draft-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="chat-ui-email-draft-card__result-row">
          <span
            className={[
              "chat-ui-email-draft-card__result",
              result.action === "sent" ? "is-sent" : "is-discarded",
            ].join(" ")}
          >
            <span>{result.action === "sent" ? "Sent" : "Discarded"}</span>
            <span className="chat-ui-email-draft-card__result-time">
              {formatAnsweredAt(result.sentAt)}
            </span>
          </span>
          {result.action === "sent" && conversationHref ? (
            <a
              className="chat-ui-email-draft-card__open"
              href={conversationHref}
            >
              Open in Messages
            </a>
          ) : null}
        </div>
      ) : !locked ? (
        <div className="chat-ui-email-draft-card__actions">
          {editing ? (
            <button
              type="button"
              className="chat-ui-email-draft-card__btn is-ghost"
              disabled={submitting}
              onClick={cancelEdit}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="chat-ui-email-draft-card__btn is-ghost"
              disabled={submitting || !onAnswer}
              onClick={startEdit}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="chat-ui-email-draft-card__btn is-ghost"
            disabled={submitting || !onAnswer}
            onClick={() => void runAction("discard")}
          >
            Discard
          </button>
          <button
            type="button"
            className="chat-ui-email-draft-card__btn is-primary"
            disabled={submitting || !onAnswer}
            onClick={() => void runAction("send")}
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function findEmailDraftCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "email-draft") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
