"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
} from "@backsteros/contracts";

export type CommunicationChatViewProps = {
  conversations: ChatConversation[];
  selectedId: string | null;
  detail: ChatConversationDetail | null;
  loading?: boolean;
  detailLoading?: boolean;
  sending?: boolean;
  error?: string | null;
  onSelect: (conversationId: string) => void;
  onRefresh: () => void;
  onSend: (content: string) => Promise<void> | void;
  onResolve: () => Promise<void> | void;
  onReopen?: () => Promise<void> | void;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function conversationTitle(row: ChatConversation): string {
  return (
    row.contactName?.trim() ||
    row.contactEmail?.trim() ||
    row.contactPhone?.trim() ||
    `Chat ${row.externalId}`
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const className = [
    "communication-chat__bubble",
    message.direction === "outgoing" ? "is-outgoing" : "",
    message.direction === "activity" ? "is-activity" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      {message.direction !== "activity" ? (
        <div className="communication-chat__bubble-meta">
          <span>{message.senderName ?? (message.direction === "outgoing" ? "You" : "Visitor")}</span>
          <span>{formatWhen(message.createdAt)}</span>
        </div>
      ) : null}
      <div className="communication-chat__bubble-body">
        {message.content || (message.private ? "(private note)" : "")}
      </div>
    </div>
  );
}

export function CommunicationChatView({
  conversations,
  selectedId,
  detail,
  loading = false,
  detailLoading = false,
  sending = false,
  error = null,
  onSelect,
  onRefresh,
  onSend,
  onResolve,
  onReopen,
}: CommunicationChatViewProps) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => conversations.find((row) => row.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length, selectedId]);

  useEffect(() => {
    setDraft("");
  }, [selectedId]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    void (async () => {
      await onSend(content);
      setDraft("");
    })();
  };

  return (
    <div className="communication-chat" data-list-board-view>
      <aside className="communication-chat__list">
        <div className="communication-chat__list-header">
          <h2>Chat</h2>
          <button type="button" disabled={loading} onClick={onRefresh}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {error ? <p className="communication-chat__error">{error}</p> : null}
        <div className="communication-chat__list-scroll">
          {conversations.length === 0 && loading ? (
            <div className="communication-chat__empty">Loading chats…</div>
          ) : conversations.length === 0 ? (
            <div className="communication-chat__empty">
              No website chats yet. Messages from the client portal widget show
              up here.
            </div>
          ) : (
            conversations.map((row) => {
              const active = row.id === selectedId;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={[
                    "communication-chat__row",
                    active ? "is-active" : "",
                    row.unread ? "is-unread" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelect(row.id)}
                >
                  <div className="communication-chat__row-top">
                    <span className="communication-chat__row-name">
                      {conversationTitle(row)}
                    </span>
                    <span className="communication-chat__row-meta">
                      {formatWhen(row.lastActivityAt)}
                    </span>
                  </div>
                  <div className="communication-chat__row-preview">
                    {row.lastMessagePreview?.trim() || row.status}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="communication-chat__thread">
        {!selectedId ? (
          <div className="communication-chat__empty">
            Select a conversation to read and reply.
          </div>
        ) : (
          <>
            <div className="communication-chat__thread-header">
              <div>
                <h2>
                  {detail
                    ? conversationTitle(detail)
                    : selected
                      ? conversationTitle(selected)
                      : "Conversation"}
                </h2>
                <p className="communication-chat__thread-sub">
                  {[
                    detail?.inboxName ?? selected?.inboxName,
                    detail?.contactEmail ?? selected?.contactEmail,
                    detail?.status ?? selected?.status,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {(detail?.status ?? selected?.status) === "resolved" ? (
                <button
                  type="button"
                  disabled={sending || detailLoading}
                  onClick={() => void onReopen?.()}
                >
                  Reopen
                </button>
              ) : (
                <button
                  type="button"
                  disabled={sending || detailLoading}
                  onClick={() => void onResolve()}
                >
                  Resolve
                </button>
              )}
            </div>
            <div className="communication-chat__messages">
              {detailLoading && !detail ? (
                <div className="communication-chat__empty">Loading thread…</div>
              ) : (detail?.messages?.length ?? 0) === 0 ? (
                <div className="communication-chat__empty">
                  No messages in this conversation yet.
                </div>
              ) : (
                (detail?.messages ?? []).map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="communication-chat__composer" onSubmit={onSubmit}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Reply…"
                rows={2}
                disabled={sending || detailLoading}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSubmit(event);
                  }
                }}
              />
              <button type="submit" disabled={sending || !draft.trim()}>
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
