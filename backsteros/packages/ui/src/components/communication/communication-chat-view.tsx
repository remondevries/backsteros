"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
} from "@backsteros/contracts";
import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
} from "../../list-nav/list-keyboard-nav-zone.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import {
  type InboxEmailListItem,
  type InboxTaskListItem,
} from "../../inbox/inbox-items.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import {
  CommunicationCreateLauncher,
  type CommunicationCreateKind,
} from "./communication-create-launcher.js";
import { CommunicationMessagesList } from "./communication-messages-list.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

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
  conversations: readonly ChatConversation[];
  emails?: readonly InboxEmailListItem[];
  /** Support tickets interleaved in the same left list. */
  supportTasks?: readonly InboxTaskListItem[];
  selectedId: string | null;
  selectedEmailId?: string | null;
  selectedSupportId?: string | null;
  detail: ChatConversationDetail | null;
  loading?: boolean;
  detailLoading?: boolean;
  error?: string | null;
  /** Conversation ids currently receiving a Chatwoot typing signal. */
  typingIds?: ReadonlySet<string>;
  /** Prefer BacksterOS contact avatars when a visitor is matched. */
  resolveAvatarSrc?: (conversation: ChatConversation) => string | null | undefined;
  /** Prefer BacksterOS contact avatars for email party rows. */
  resolveEmailAvatarSrc?: (item: InboxEmailListItem) => string | null | undefined;
  /** Resolve a contact avatar for multi-party stacks on email cards. */
  resolveContactAvatarSrc?: (contactId: string) => string | null | undefined;
  /** Match chat visitors to CRM contacts for list filters. */
  resolveConversationContactId?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  /** Match chat visitors to CRM organizations for list filters. */
  resolveConversationOrganizationId?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  contactFilterOptions?: readonly SearchableDropdownOption<string>[];
  organizationFilterOptions?: readonly SearchableDropdownOption<string>[];
  projectFilterOptions?: readonly SearchableDropdownOption<string>[];
  onSelect: (conversationId: string) => void;
  onSelectEmail?: (emailId: string) => void;
  onSelectSupport?: (supportId: string) => void;
  onSend: (content: string) => Promise<void> | void;
  /** Notify Chatwoot that the agent is typing (drives the website widget). */
  onTypingChange?: (typing: boolean) => void;
  /** Compact email thread for the center pane when an email row is selected. */
  emailThreadSlot?: ReactNode;
  /** Support ticket detail for the center pane when a support row is selected. */
  supportThreadSlot?: ReactNode;
  /**
   * Create flow: floating + opens the type launcher in the center pane.
   * Parent owns the open flag so selecting a list row can dismiss it.
   * When `createKind` is set (e.g. email), the matching compose slot replaces
   * the launcher — left list stays mounted.
   */
  createOpen?: boolean;
  createKind?: CommunicationCreateKind | null;
  onCreateOpenChange?: (open: boolean) => void;
  onCreateKind?: (kind: CommunicationCreateKind) => void;
  /** Embedded new-email compose (Communication create → Email). */
  emailComposeSlot?: ReactNode;
  /**
   * Embedded WhatsApp / Instagram / Messenger create form (Communication → +).
   * Shown when `createKind` is one of those channel kinds.
   */
  channelCreateSlot?: ReactNode;
  /**
   * Optional notice pinned above the message list (e.g. missing channel social).
   * Only shown for the selected live chat thread — not email/support/create.
   */
  threadNotice?: ReactNode;
  /** Row ids in on-screen order (after search/filters) — drives delete → neighbor. */
  onVisibleRowIdsChange?: (rowIds: readonly string[]) => void;
  /**
   * `full` — list + thread (default). `thread` — conversation pane only
   * (contact/org Communication workspace embed).
   */
  pane?: "full" | "thread";
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

function MessageBubble({
  message,
  keyboardHighlighted = false,
}: {
  message: ChatMessage;
  keyboardHighlighted?: boolean;
}) {
  const pending = isOptimisticMessage(message);
  const body = message.content || (message.private ? "(private note)" : "");

  if (message.direction === "activity") {
    return (
      <div
        className={[
          "communication-chat__message",
          "is-activity",
          keyboardNavItemClass(keyboardHighlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={-1}
        {...keyboardNavItemProps(message.id)}
      >
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
    keyboardNavItemClass(keyboardHighlighted),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      tabIndex={-1}
      {...keyboardNavItemProps(message.id)}
    >
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

/** Matches client.lemo-design.com `AgentTypingIndicator` — bouncing dots. */
function ContactTypingIndicator() {
  return (
    <div
      className="communication-chat__message is-incoming communication-chat__typing"
      aria-live="polite"
      aria-label="Contact is typing"
    >
      <span className="communication-chat__typing-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
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
  emails = [],
  supportTasks = [],
  selectedId,
  selectedEmailId = null,
  selectedSupportId = null,
  detail,
  loading = false,
  detailLoading = false,
  error = null,
  typingIds,
  resolveAvatarSrc,
  resolveEmailAvatarSrc,
  resolveContactAvatarSrc,
  resolveConversationContactId,
  resolveConversationOrganizationId,
  contactFilterOptions = [],
  organizationFilterOptions = [],
  projectFilterOptions = [],
  onSelect,
  onSelectEmail,
  onSelectSupport,
  onSend,
  onTypingChange,
  emailThreadSlot = null,
  supportThreadSlot = null,
  createOpen = false,
  createKind = null,
  onCreateOpenChange,
  onCreateKind,
  emailComposeSlot = null,
  channelCreateSlot = null,
  threadNotice = null,
  onVisibleRowIdsChange,
  pane = "full",
}: CommunicationChatViewProps) {
  const [draft, setDraft] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const prevSelectedIdRef = useRef<string | null>(null);
  const threadMessagesContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_CONTENT,
  );
  const emailSelected = Boolean(selectedEmailId);
  const supportSelected = Boolean(selectedSupportId);
  const selectedIsTyping =
    !emailSelected &&
    !supportSelected &&
    selectedId != null &&
    typingIds?.has(selectedId) === true;

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
    if (emailSelected || supportSelected) return;
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
  }, [
    detail?.messages.length,
    emailSelected,
    supportSelected,
    selectedId,
    selectedIsTyping,
    scrollToBottom,
    updateNearBottom,
  ]);

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

  const openCreate = () => {
    onCreateOpenChange?.(true);
  };
  const closeCreate = () => {
    onCreateOpenChange?.(false);
  };
  const selectAndCloseCreate = (conversationId: string) => {
    closeCreate();
    onSelect(conversationId);
  };
  const selectEmailAndCloseCreate = (emailId: string) => {
    closeCreate();
    onSelectEmail?.(emailId);
  };
  const selectSupportAndCloseCreate = (supportId: string) => {
    closeCreate();
    onSelectSupport?.(supportId);
  };

  const threadOnly = pane === "thread";
  const threadMessages = detail?.messages;
  const threadMessageIds = useMemo(
    () =>
      emailSelected || supportSelected || createOpen || !threadMessages
        ? []
        : threadMessages.map((message) => message.id),
    [createOpen, emailSelected, supportSelected, threadMessages],
  );
  const latestThreadMessageId =
    threadMessageIds.length > 0
      ? threadMessageIds[threadMessageIds.length - 1]!
      : null;
  const { highlightedId: threadHighlightedId } = useListKeyboardNavigation({
    containerRef: messagesRef,
    itemIds: threadMessageIds,
    selectedId: latestThreadMessageId,
    onNavigate: () => {
      // Highlight-only — chat bubbles have no open action.
    },
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    enabled: threadMessageIds.length > 0,
  });

  return (
    <div
      className={[
        "communication-chat",
        createOpen ? "communication-chat--create" : null,
        threadOnly ? "communication-chat--thread-only" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-list-board-view
    >
      {threadOnly ? null : (
      <aside className="communication-chat__list">
        <CommunicationMessagesList
          conversations={conversations}
          emails={emails}
          supportTasks={supportTasks}
          selectedChatId={selectedId}
          selectedEmailId={selectedEmailId}
          selectedSupportId={selectedSupportId}
          loading={loading}
          error={error}
          typingIds={typingIds}
          resolveAvatarSrc={resolveAvatarSrc}
          resolveEmailAvatarSrc={resolveEmailAvatarSrc}
          resolveContactAvatarSrc={resolveContactAvatarSrc}
          resolveConversationContactId={resolveConversationContactId}
          resolveConversationOrganizationId={resolveConversationOrganizationId}
          contactFilterOptions={contactFilterOptions}
          organizationFilterOptions={organizationFilterOptions}
          projectFilterOptions={projectFilterOptions}
          onSelectChat={selectAndCloseCreate}
          onSelectEmail={selectEmailAndCloseCreate}
          onSelectSupport={selectSupportAndCloseCreate}
          onVisibleRowIdsChange={onVisibleRowIdsChange}
        />
        {onCreateOpenChange ? (
          <button
            type="button"
            className={[
              "communication-chat__create-fab",
              createOpen ? "is-active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={createOpen ? "Close create" : "Create conversation"}
            title={createOpen ? "Close create" : "Create conversation"}
            aria-pressed={createOpen}
            onClick={() => {
              if (createOpen) closeCreate();
              else openCreate();
            }}
          >
            <SidePanelPlusIcon />
          </button>
        ) : null}
      </aside>
      )}

      <section className="communication-chat__thread">
        {createOpen && createKind === "email" ? (
          emailComposeSlot ?? (
            <div className="communication-chat__empty">
              Compose a new email…
            </div>
          )
        ) : createOpen &&
          (createKind === "whatsapp" ||
            createKind === "instagram" ||
            createKind === "messenger" ||
            createKind === "chat" ||
            createKind === "support") ? (
          channelCreateSlot ?? (
            <div className="communication-chat__empty">
              {createKind === "support"
                ? "Create a support ticket…"
                : createKind === "chat"
                  ? "Start a new Telegram conversation…"
                  : `Start a new ${createKind} conversation…`}
            </div>
          )
        ) : createOpen ? (
          <CommunicationCreateLauncher
            onSelect={(kind) => {
              onCreateKind?.(kind);
            }}
            onCancel={closeCreate}
          />
        ) : emailSelected && emailComposeSlot ? (
          emailComposeSlot
        ) : emailSelected ? (
          emailThreadSlot ?? (
            <div className="communication-chat__empty">
              Select an email to read the thread.
            </div>
          )
        ) : supportSelected ? (
          supportThreadSlot ?? (
            <div className="communication-chat__empty">
              Select a support ticket to open it.
            </div>
          )
        ) : !selectedId ? (
          <div className="communication-chat__empty">
            Select a conversation to read and reply.
          </div>
        ) : (
          <div className="communication-chat__thread-body">
            <div className="communication-chat__thread-container">
              {threadNotice ? (
                <div className="communication-chat__thread-notice">
                  {threadNotice}
                </div>
              ) : null}
              <div className="communication-chat__messages-wrap">
                <div
                  className="communication-chat__messages"
                  ref={messagesRef}
                  onScroll={onMessagesScroll}
                  {...threadMessagesContainerProps}
                >
                  {detailLoading && !detail ? (
                    <div className="communication-chat__empty">
                      Loading thread…
                    </div>
                  ) : (detail?.messages?.length ?? 0) === 0 &&
                    !selectedIsTyping ? (
                    <div className="communication-chat__empty">
                      No messages in this conversation yet.
                    </div>
                  ) : (
                    <>
                      {(threadMessages ?? []).map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          keyboardHighlighted={
                            threadHighlightedId === message.id
                          }
                        />
                      ))}
                      {selectedIsTyping ? <ContactTypingIndicator /> : null}
                    </>
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
