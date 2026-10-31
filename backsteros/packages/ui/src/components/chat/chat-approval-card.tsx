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
  ChatThreadMessageApprovalKind,
  ChatUiApprovalCardData,
  ChatUiCardPart,
} from "@backsteros/contracts";
import { chatUiApprovalCardDataSchema } from "@backsteros/contracts";

import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";

export type ChatApprovalAnswerFn = (
  messageId: string,
  decision: "approved" | "rejected",
  note?: string,
) => void | Promise<void>;

const ChatApprovalAnswerContext = createContext<ChatApprovalAnswerFn | null>(
  null,
);

export function ChatApprovalAnswerProvider({
  onAnswer,
  children,
}: {
  onAnswer?: ChatApprovalAnswerFn | null;
  children: ReactNode;
}) {
  return (
    <ChatApprovalAnswerContext.Provider value={onAnswer ?? null}>
      {children}
    </ChatApprovalAnswerContext.Provider>
  );
}

export function useChatApprovalAnswerOptional(): ChatApprovalAnswerFn | null {
  return useContext(ChatApprovalAnswerContext);
}

function parseApprovalData(
  part: ChatUiCardPart,
): ChatUiApprovalCardData | null {
  const parsed = chatUiApprovalCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function ApprovalKindIcon({
  kind,
}: {
  kind: ChatThreadMessageApprovalKind;
}) {
  const common = {
    className: "chat-ui-approval-card__kind-icon",
    viewBox: "0 0 16 16",
    width: 16,
    height: 16,
    "aria-hidden": true as const,
  };
  switch (kind) {
    case "deploy":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M8 1.5 3 6h3v5h4V6h3L8 1.5ZM3 13h10v1.5H3V13Z"
          />
        </svg>
      );
    case "invoice":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M4 1.5h8a1 1 0 0 1 1 1v11l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V2.5a1 1 0 0 1 1-1Zm1 3v1.5h6V4.5H5Zm0 3V9h6V7.5H5Z"
          />
        </svg>
      );
    case "email":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M2 3.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm.8 1.4 5.2 3.4 5.2-3.4H2.8Zm10.7 1.3-5.1 3.3a1 1 0 0 1-1.1 0L2.2 6.2V11h11.3V6.2Z"
          />
        </svg>
      );
    case "payment":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M1.5 4.5A1.5 1.5 0 0 1 3 3h10a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3A1.5 1.5 0 0 1 1.5 11.5v-7ZM3 5v1.5h10V5H3Zm0 4v1.5h4V9H3Z"
          />
        </svg>
      );
    case "delete":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M6 2h4l.5 1H14v1.5H2V3h3.5L6 2Zm1 4v5.5h1.5V6H7Zm2.5 0v5.5H11V6H9.5ZM4.5 4.5l.8 8.2A1 1 0 0 0 6.3 13.5h3.4a1 1 0 0 0 1-.8l.8-8.2h-7Z"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2a1 1 0 0 0-1 1v3.2L5.4 9.3a1 1 0 1 0 1.2 1.6L8.5 9A1 1 0 0 0 9 8.2V4.5a1 1 0 0 0-1-1Z"
          />
        </svg>
      );
  }
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

export function ChatApprovalCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseApprovalData(part), [part]);
  const onAnswer = useChatApprovalAnswerOptional();
  const [submitting, setSubmitting] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const locked = Boolean(data?.answer) || data?.dismissed === true;

  const submit = useCallback(
    async (decision: "approved" | "rejected", withNote?: string) => {
      if (!data || !onAnswer || submitting) return;
      setSubmitting(true);
      try {
        const trimmed = withNote?.trim();
        await onAnswer(
          data.messageId,
          decision,
          trimmed && trimmed.length > 0 ? trimmed : undefined,
        );
      } finally {
        setSubmitting(false);
      }
    },
    [data, onAnswer, submitting],
  );

  if (!data) return null;

  const approveLabel = data.approveLabel?.trim() || "Approve";
  const rejectLabel = data.rejectLabel?.trim() || "Reject";
  const answer = data.answer;

  return (
    <div
      className={[
        "chat-ui-approval-card",
        data.dismissed ? "is-dismissed" : "",
        answer ? "is-answered" : "",
        answer?.decision === "approved" ? "is-approved" : "",
        answer?.decision === "rejected" ? "is-rejected" : "",
        submitting ? "is-submitting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
      data-kind={data.kind}
    >
      <div className="chat-ui-approval-card__header">
        <ApprovalKindIcon kind={data.kind} />
        <h3 className="chat-ui-approval-card__title">{data.title}</h3>
      </div>

      <div className="chat-ui-approval-card__summary">
        <DocumentMarkdownPreview body={data.summary} forceInlineMentions />
      </div>

      {data.fields && data.fields.length > 0 ? (
        <dl className="chat-ui-approval-card__fields">
          {data.fields.map((field) => (
            <div key={`${field.label}:${field.value}`} className="chat-ui-approval-card__field">
              <dt>{field.label}</dt>
              <dd>
                <DocumentMarkdownPreview
                  body={field.value}
                  forceInlineMentions
                />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {data.details ? (
        <div className="chat-ui-approval-card__details">
          <button
            type="button"
            className="chat-ui-approval-card__details-toggle"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? "Hide details" : "Show details"}
          </button>
          {detailsOpen ? (
            <div className="chat-ui-approval-card__details-body">
              <DocumentMarkdownPreview
                body={data.details}
                forceInlineMentions
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {answer ? (
        <div
          className={[
            "chat-ui-approval-card__result",
            answer.decision === "approved" ? "is-approved" : "is-rejected",
          ].join(" ")}
        >
          <span className="chat-ui-approval-card__result-label">
            {answer.decision === "approved" ? "Approved" : "Rejected"}
          </span>
          <span className="chat-ui-approval-card__result-time">
            {formatAnsweredAt(answer.answeredAt)}
          </span>
          {answer.note ? (
            <span className="chat-ui-approval-card__result-note">
              {answer.note}
            </span>
          ) : null}
        </div>
      ) : !locked ? (
        <div className="chat-ui-approval-card__actions">
          <button
            type="button"
            className={[
              "chat-ui-approval-card__btn",
              data.destructive ? "is-danger" : "is-primary",
            ].join(" ")}
            disabled={submitting || !onAnswer}
            onClick={() => void submit("approved")}
          >
            {approveLabel}
          </button>
          <button
            type="button"
            className="chat-ui-approval-card__btn is-default"
            disabled={submitting || !onAnswer}
            onClick={() => void submit("rejected")}
          >
            {rejectLabel}
          </button>
          <button
            type="button"
            className="chat-ui-approval-card__btn is-ghost"
            disabled={submitting || !onAnswer}
            onClick={() => setNoteOpen((open) => !open)}
          >
            Reject with note
          </button>
        </div>
      ) : null}

      {noteOpen && !locked ? (
        <div className="chat-ui-approval-card__note">
          <textarea
            className="chat-ui-approval-card__note-input"
            rows={2}
            maxLength={500}
            placeholder="Reason for rejection…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={submitting}
          />
          <button
            type="button"
            className="chat-ui-approval-card__btn is-danger"
            disabled={submitting || !onAnswer || note.trim().length === 0}
            onClick={() => void submit("rejected", note)}
          >
            {rejectLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Extract the approval card part from a message (if any). */
export function findApprovalCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "approval") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
