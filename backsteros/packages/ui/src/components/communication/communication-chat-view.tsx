"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent,
} from "react";
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
} from "@backsteros/contracts";

import {
  chatConversationToTaskItemRowTask,
  chatStatusToTaskStatus,
  groupChatConversationsByStatus,
} from "../../communication/chat-conversation-list-item.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

const CHAT_CARD_AVATAR_SIZE = 40;

/** Kind mark for chat list cards — green badge + bubble (card-bg fill). */
/** Idle chat kind — solid bubble. */
function ChatListKindIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M11.953 2.25c-2.317 0-4.118 0-5.52.15-1.418.153-2.541.47-3.437 1.186-.92.736-1.35 1.693-1.553 2.9-.193 1.152-.193 2.618-.193 4.446v.183c0 1.782 0 3.015.2 3.934.108.495.278.925.545 1.323.264.392.6.722 1.001 1.042.631.505 1.375.81 2.254 1V21a.75.75 0 0 0 1.123.65c.586-.335 1.105-.7 1.58-1.044l.304-.221a22 22 0 0 1 1.036-.73c.844-.548 1.65-.905 2.707-.905h.047c2.317 0 4.118 0 5.52-.15 1.418-.153 2.541-.47 3.437-1.186.4-.32.737-.65 1-1.042.268-.398.438-.828.546-1.323.2-.919.2-2.152.2-3.934v-.183c0-1.828 0-3.294-.193-4.445-.203-1.208-.633-2.165-1.553-2.901-.896-.717-2.019-1.033-3.437-1.185-1.402-.151-3.203-.151-5.52-.151z" />
    </svg>
  );
}

/** Typing — previous bubble with three dots so the list shows live typing. */
function ChatListTypingIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M6.433 2.4c1.402-.15 3.203-.15 5.52-.15h.094c2.317 0 4.118 0 5.52.15 1.418.153 2.541.47 3.437 1.186.92.736 1.35 1.693 1.553 2.9.193 1.152.193 2.618.193 4.446v.183c0 1.782 0 3.015-.2 3.934a3.7 3.7 0 0 1-.545 1.323c-.264.392-.6.722-1 1.042-.897.717-2.02 1.033-3.438 1.185-1.402.151-3.203.151-5.52.151H12c-1.056 0-1.863.357-2.707.906-.342.221-.675.464-1.036.729l-.304.22c-.475.345-.994.71-1.58 1.046A.75.75 0 0 1 5.25 21v-2.585c-.879-.19-1.623-.496-2.254-1-.4-.321-.737-.65-1-1.043a3.7 3.7 0 0 1-.546-1.323c-.2-.919-.2-2.152-.2-3.934v-.183c0-1.828 0-3.294.193-4.445.203-1.208.633-2.165 1.553-2.901.896-.717 2.019-1.033 3.437-1.185m2.317 8.1a.75.75 0 0 0-1.5 0v.5a.75.75 0 0 0 1.5 0zm4 0a.75.75 0 0 0-1.5 0v.5a.75.75 0 0 0 1.5 0zm4 0a.75.75 0 0 0-1.5 0v.5a.75.75 0 0 0 1.5 0z" />
    </svg>
  );
}

function chatConversationAgeLabel(row: ChatConversation): {
  label: string;
  title: string | undefined;
} {
  const raw = row.lastActivityAt ?? row.updatedAt;
  const label = formatRelativeAgeLabel(raw);
  if (!label || !raw) return { label: "", title: undefined };
  const ms = new Date(raw).getTime();
  return {
    label,
    title: Number.isFinite(ms) ? new Date(ms).toLocaleString() : undefined,
  };
}

const NEAR_BOTTOM_PX = 96;

/** Compact set matching Lemo’s “Frequently used” composer tray. */
const COMPOSER_EMOJI = [
  "😀",
  "😂",
  "😍",
  "🙏",
  "👍",
  "🔥",
  "✅",
  "🎉",
  "❤️",
  "😊",
  "🤝",
  "💡",
  "😅",
  "🤔",
  "🙌",
  "✨",
] as const;

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 10h.01M15.5 10h.01M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function insertAtCaret(
  value: string,
  insert: string,
  el: HTMLTextAreaElement | null,
): { next: string; caret: number } {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return { next, caret: start + insert.length };
}

export type CommunicationChatViewProps = {
  conversations: ChatConversation[];
  selectedId: string | null;
  detail: ChatConversationDetail | null;
  loading?: boolean;
  detailLoading?: boolean;
  error?: string | null;
  /** Conversation ids currently receiving a Chatwoot typing signal. */
  typingIds?: ReadonlySet<string>;
  /** Prefer BacksterOS contact avatars when a visitor is matched. */
  resolveAvatarSrc?: (conversation: ChatConversation) => string | null | undefined;
  onSelect: (conversationId: string) => void;
  onSend: (content: string) => Promise<void> | void;
  /** Notify Chatwoot that the agent is typing (drives the website widget). */
  onTypingChange?: (typing: boolean) => void;
};

/** Compact clock under bubbles — matches Lemo `aui-message-timestamp`. */
function formatMessageClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isOptimisticMessage(message: ChatMessage): boolean {
  return message.id.startsWith("local-");
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const pending = isOptimisticMessage(message);
  const body = message.content || (message.private ? "(private note)" : "");

  if (message.direction === "activity") {
    return (
      <div className="communication-chat__message is-activity">
        <div className="communication-chat__bubble">{body}</div>
      </div>
    );
  }

  const outgoing = message.direction === "outgoing";
  const clock = pending ? "Sending…" : formatMessageClock(message.createdAt);
  const className = [
    "communication-chat__message",
    outgoing ? "is-outgoing" : "is-incoming",
    pending ? "is-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="communication-chat__bubble">{body}</div>
      {clock ? (
        <time
          className="communication-chat__timestamp"
          dateTime={pending ? undefined : message.createdAt}
        >
          {clock}
        </time>
      ) : null}
    </div>
  );
}

type ChatComposerProps = {
  draft: string;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onTypingChange?: (typing: boolean) => void;
};

const COMPOSER_TYPING_IDLE_MS = 2_500;

/** Lemo Client-API composer shell — rounded dark rail + toolbar + orange send. */
function ChatComposer({
  draft,
  disabled = false,
  onDraftChange,
  onSubmit,
  onTypingChange,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiWrapRef = useRef<HTMLDivElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingIdleTimerRef = useRef<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const canSend = draft.trim().length > 0 && !disabled;

  const stopTyping = useCallback(() => {
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    onTypingChange?.(false);
  }, [onTypingChange]);

  const signalTyping = useCallback(() => {
    if (!onTypingChange) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingChange(true);
    }
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      typingIdleTimerRef.current = null;
      if (!typingActiveRef.current) return;
      typingActiveRef.current = false;
      onTypingChange(false);
    }, COMPOSER_TYPING_IDLE_MS);
  }, [onTypingChange]);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current != null) {
        window.clearTimeout(typingIdleTimerRef.current);
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        onTypingChange?.(false);
      }
    };
  }, [onTypingChange]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!emojiWrapRef.current?.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [emojiOpen]);

  const focusInput = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const insertEmoji = useCallback(
    (emoji: string) => {
      const { next, caret } = insertAtCaret(
        draft,
        emoji,
        textareaRef.current,
      );
      onDraftChange(next);
      setEmojiOpen(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [draft, onDraftChange],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit(event);
    }
  };

  return (
    <form className="communication-chat__composer" onSubmit={onSubmit}>
      <div
        className="communication-chat__composer-shell"
        data-slot="chat_composer-shell"
        onClick={focusInput}
      >
        <textarea
          ref={textareaRef}
          className="communication-chat__composer-input"
          value={draft}
          onChange={(event) => {
            onDraftChange(event.target.value);
            if (event.target.value.trim()) signalTyping();
            else stopTyping();
          }}
          placeholder="Send a message…"
          rows={1}
          disabled={disabled}
          enterKeyHint="send"
          aria-label="Message"
          onKeyDown={onKeyDown}
          onBlur={() => stopTyping()}
          onClick={(event) => event.stopPropagation()}
        />
        <div
          className="communication-chat__composer-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="communication-chat__composer-tools">
            <button
              type="button"
              className="communication-chat__composer-tool"
              title="Attachments coming soon"
              aria-label="Add attachment"
              disabled
            >
              <PlusIcon />
            </button>
            <div className="communication-chat__emoji" ref={emojiWrapRef}>
              <button
                type="button"
                className={[
                  "communication-chat__composer-tool",
                  emojiOpen ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title="Add emoji"
                aria-label="Add emoji"
                aria-expanded={emojiOpen}
                disabled={disabled}
                onClick={() => setEmojiOpen((open) => !open)}
              >
                <SmileIcon />
              </button>
              {emojiOpen ? (
                <div
                  className="communication-chat__emoji-popover"
                  role="listbox"
                  aria-label="Emoji"
                >
                  {COMPOSER_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="communication-chat__emoji-item"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="submit"
            className="communication-chat__composer-send"
            disabled={!canSend}
            title="Send message"
            aria-label="Send message"
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    </form>
  );
}

export function CommunicationChatView({
  conversations,
  selectedId,
  detail,
  loading = false,
  detailLoading = false,
  error = null,
  typingIds,
  resolveAvatarSrc,
  onSelect,
  onSend,
  onTypingChange,
}: CommunicationChatViewProps) {
  const [draft, setDraft] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const prevSelectedIdRef = useRef<string | null>(null);
  const statusGroups = useMemo(
    () => groupChatConversationsByStatus(conversations),
    [conversations],
  );

  function toggleGroup(status: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const updateNearBottom = useCallback((el: HTMLDivElement) => {
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance <= NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, []);

  const onMessagesScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      updateNearBottom(event.currentTarget);
    },
    [updateNearBottom],
  );

  useEffect(() => {
    const selectedChanged = prevSelectedIdRef.current !== selectedId;
    prevSelectedIdRef.current = selectedId;
    if (selectedChanged) {
      stickToBottomRef.current = true;
      setShowJumpToLatest(false);
      // Instant jump on conversation switch so we don't animate from mid-thread.
      requestAnimationFrame(() => scrollToBottom("auto"));
      return;
    }
    if (stickToBottomRef.current) {
      scrollToBottom("smooth");
    } else {
      const el = messagesRef.current;
      if (el) updateNearBottom(el);
    }
  }, [detail?.messages.length, selectedId, scrollToBottom, updateNearBottom]);

  useEffect(() => {
    setDraft("");
  }, [selectedId]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    // Clear immediately so optimistic send feels instant (Lemo pattern).
    setDraft("");
    onTypingChange?.(false);
    stickToBottomRef.current = true;
    void onSend(content);
  };

  return (
    <div className="communication-chat" data-list-board-view>
      <aside className="communication-chat__list">
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
            <ul
              className="overview-grouped-list communication-chat__task-list"
              aria-label="Chat conversations"
            >
              {statusGroups.map((group) => {
                const collapsed = collapsedGroups.has(group.status);
                return (
                  <StatusGroupSection
                    key={group.status}
                    groupKey={chatStatusToTaskStatus(group.status)}
                    title={group.label}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(group.status)}
                    icon={
                      <TaskStatusIcon
                        status={chatStatusToTaskStatus(group.status)}
                        size={14}
                        support
                      />
                    }
                  >
                    {group.conversations.map((row) => {
                      const task = chatConversationToTaskItemRowTask(row);
                      const preview = row.lastMessagePreview?.trim() || "";
                      const personLabel =
                        row.contactName?.trim() ||
                        row.contactEmail?.trim() ||
                        row.contactPhone?.trim() ||
                        "Visitor";
                      const avatarSrc =
                        resolveAvatarSrc?.(row)?.trim() ||
                        row.contactAvatarUrl?.trim() ||
                        null;
                      const age = chatConversationAgeLabel(row);
                      const active = row.id === selectedId;
                      const isTyping = typingIds?.has(row.id) === true;
                      return (
                        <li
                          key={row.id}
                          className={[
                            "project-tasks-list__card-item",
                            "task-kanban-card-item",
                            "communication-chat__card-item",
                            keyboardNavItemClass(active),
                            active
                              ? "communication-chat__card-item--active"
                              : null,
                            row.unread
                              ? "communication-chat__card-item--unread"
                              : null,
                            isTyping
                              ? "communication-chat__card-item--typing"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {...keyboardNavItemProps(row.id)}
                        >
                          <TaskBoardCard
                            task={{
                              ...task,
                              // Title row shows the last message; name sits with age.
                              title: preview,
                            }}
                            onOpen={() => onSelect(row.id)}
                            showDueDate
                            showDisplayId={false}
                            showStatus={false}
                            leadingSlot={
                              <span
                                className="communication-chat__card-avatar-wrap"
                                title={personLabel}
                              >
                                <span
                                  className="communication-chat__card-avatar"
                                  aria-hidden="true"
                                >
                                  {avatarSrc ? (
                                    <EntityAvatarIcon
                                      src={avatarSrc}
                                      size={CHAT_CARD_AVATAR_SIZE}
                                      kind="contact"
                                    />
                                  ) : (
                                    <ContactPersonIcon
                                      size={Math.round(
                                        CHAT_CARD_AVATAR_SIZE * 0.55,
                                      )}
                                    />
                                  )}
                                </span>
                                <span
                                  className={[
                                    "communication-chat__card-kind",
                                    isTyping
                                      ? "communication-chat__card-kind--typing"
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  title={isTyping ? "Typing…" : "Chat"}
                                  aria-label={isTyping ? "Typing" : "Chat"}
                                >
                                  {isTyping ? (
                                    <ChatListTypingIcon />
                                  ) : (
                                    <ChatListKindIcon />
                                  )}
                                </span>
                              </span>
                            }
                            topLeadingSlot={
                              <span
                                className="communication-chat__card-name"
                                title={personLabel}
                              >
                                {personLabel}
                              </span>
                            }
                            ownerSlot={
                              age.label ? (
                                <span
                                  className="communication-chat__card-age"
                                  title={age.title}
                                >
                                  {age.label}
                                </span>
                              ) : null
                            }
                          />
                        </li>
                      );
                    })}
                  </StatusGroupSection>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="communication-chat__thread">
        {!selectedId ? (
          <div className="communication-chat__empty">
            Select a conversation to read and reply.
          </div>
        ) : (
          <div className="communication-chat__thread-body">
            <div className="communication-chat__thread-container">
              <div className="communication-chat__messages-wrap">
                <div
                  className="communication-chat__messages"
                  ref={messagesRef}
                  onScroll={onMessagesScroll}
                >
                  {detailLoading && !detail ? (
                    <div className="communication-chat__empty">
                      Loading thread…
                    </div>
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
                {showJumpToLatest ? (
                  <button
                    type="button"
                    className="communication-chat__jump-latest"
                    onClick={() => scrollToBottom("smooth")}
                  >
                    Jump to latest
                  </button>
                ) : null}
              </div>
              <ChatComposer
                draft={draft}
                disabled={detailLoading && !detail}
                onDraftChange={setDraft}
                onSubmit={onSubmit}
                onTypingChange={onTypingChange}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
