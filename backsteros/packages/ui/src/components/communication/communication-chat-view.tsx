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
import { SearchIcon, XCircleFillIcon } from "@primer/octicons-react";

import {
  chatConversationToTaskItemRowTask,
  chatStatusToTaskStatus,
} from "../../communication/chat-conversation-list-item.js";
import {
  EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
  communicationChatListFiltersAreActive,
  filterCommunicationChatListGroupsByFilters,
  type CommunicationChatListFilters,
} from "../../communication/communication-chat-list-filters.js";
import {
  emailListItemPartyName,
  filterCommunicationChatListGroups,
  groupCommunicationChatListRows,
  peelCommunicationDraftEmailRows,
  supportListItemPartyName,
} from "../../communication/communication-chat-list-row.js";
import {
  inboxListItemToTaskItemRowTask,
  type InboxEmailListItem,
  type InboxTaskListItem,
} from "../../inbox/inbox-items.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import { CommunicationChatListFilterMenu } from "./communication-chat-list-filter-menu.js";
import {
  CommunicationChatKindIcon,
  CommunicationSupportKindIcon,
  CommunicationWhatsAppKindIcon,
} from "./communication-kind-icons.js";
import {
  CommunicationCreateLauncher,
  type CommunicationCreateKind,
} from "./communication-create-launcher.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

const CHAT_CARD_AVATAR_SIZE = 40;
/** Small overlapping faces on multi-contact email cards. */
const CHAT_CARD_PARTY_AVATAR_SIZE = 16;
const CHAT_CARD_PARTY_AVATAR_MAX = 3;

function EmailPartyAvatarStack({
  contactIds,
  resolveContactAvatarSrc,
}: {
  contactIds: readonly string[];
  resolveContactAvatarSrc?: (contactId: string) => string | null | undefined;
}) {
  if (contactIds.length < 2) return null;
  const visible = contactIds.slice(0, CHAT_CARD_PARTY_AVATAR_MAX);
  const overflow = contactIds.length - visible.length;
  return (
    <span
      className="communication-chat__card-party-stack"
      title={`${contactIds.length} contacts in this thread`}
      aria-label={`${contactIds.length} contacts in this thread`}
    >
      {visible.map((contactId, index) => {
        const src = resolveContactAvatarSrc?.(contactId)?.trim() || null;
        return (
          <span
            key={contactId}
            className="communication-chat__card-party-avatar"
            style={{ zIndex: visible.length - index }}
          >
            {src ? (
              <EntityAvatarIcon
                src={src}
                size={CHAT_CARD_PARTY_AVATAR_SIZE}
                kind="contact"
              />
            ) : (
              <ContactPersonIcon
                size={Math.round(CHAT_CARD_PARTY_AVATAR_SIZE * 0.7)}
              />
            )}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="communication-chat__card-party-overflow">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

const WHATSAPP_PLACEHOLDER_ID = "__whatsapp-placeholder__";

const WHATSAPP_PLACEHOLDER_TASK = {
  id: WHATSAPP_PLACEHOLDER_ID,
  number: 0,
  title: "WhatsApp cards will show here once connected",
  status: "triage",
  priority: 0,
  dueDate: null,
  projectId: null,
  projectKey: null,
  projectName: null,
  assigneeId: null,
  listKind: "task" as const,
};

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

function emailAgeLabel(item: InboxEmailListItem): {
  label: string;
  title: string | undefined;
} {
  const raw = item.updatedAt;
  const label = formatRelativeAgeLabel(raw);
  if (!label || raw == null) return { label: "", title: undefined };
  return {
    label,
    title: Number.isFinite(raw) ? new Date(raw).toLocaleString() : undefined,
  };
}

function CommunicationEmailListCard({
  item,
  selectedEmailId,
  resolveEmailAvatarSrc,
  resolveContactAvatarSrc,
  onOpen,
}: {
  item: InboxEmailListItem;
  selectedEmailId: string | null | undefined;
  resolveEmailAvatarSrc?: (item: InboxEmailListItem) => string | null | undefined;
  resolveContactAvatarSrc?: (contactId: string) => string | null | undefined;
  onOpen: (emailId: string) => void;
}) {
  const task = inboxListItemToTaskItemRowTask(item);
  if (!task) return null;
  const personLabel = emailListItemPartyName(item);
  const avatarSrc = resolveEmailAvatarSrc?.(item)?.trim() || null;
  const avatarKind = item.contactId?.trim()
    ? "contact"
    : item.organizationId?.trim()
      ? "organization"
      : "contact";
  const age = emailAgeLabel(item);
  const active = item.id === selectedEmailId;
  const partyContactIds = item.partyContactIds ?? [];
  const isDraft =
    Boolean(item.draftId?.trim()) || item.status === "concept";
  return (
    <li
      className={[
        "project-tasks-list__card-item",
        "task-kanban-card-item",
        "communication-chat__card-item",
        keyboardNavItemClass(active),
        active ? "communication-chat__card-item--active" : null,
        item.unread ? "communication-chat__card-item--unread" : null,
        isDraft ? "communication-chat__card-item--draft" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(item.id)}
    >
      <TaskBoardCard
        task={{
          ...task,
          title: item.title?.trim() || "(no subject)",
          emailPartyLabel: null,
          emailDirection: null,
        }}
        onOpen={() => onOpen(item.id)}
        showDueDate
        showDisplayId={false}
        showStatus={false}
        showEmailMark={false}
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
                  kind={avatarKind}
                />
              ) : avatarKind === "organization" ? (
                <OrganizationIcon
                  size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)}
                />
              ) : (
                <ContactPersonIcon
                  size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)}
                />
              )}
            </span>
            <span
              className="communication-chat__card-kind communication-chat__card-kind--email"
              title={item.unread ? "Unread email" : "Email"}
              aria-label={item.unread ? "Unread email" : "Email"}
            >
              <InboxItemTypeIcon
                kind="email"
                size={9}
                unread={item.unread === true}
              />
            </span>
          </span>
        }
        topLeadingSlot={
          <span className="communication-chat__card-name" title={personLabel}>
            {personLabel}
          </span>
        }
        ownerSlot={
          age.label ? (
            <span className="communication-chat__card-age" title={age.title}>
              {age.label}
            </span>
          ) : null
        }
        metaTrailingSlot={
          partyContactIds.length > 1 ? (
            <EmailPartyAvatarStack
              contactIds={partyContactIds}
              resolveContactAvatarSrc={resolveContactAvatarSrc}
            />
          ) : null
        }
      />
    </li>
  );
}

function supportAgeLabel(item: InboxTaskListItem): {
  label: string;
  title: string | undefined;
} {
  const raw = item.updatedAt;
  const label = formatRelativeAgeLabel(raw);
  if (!label || raw == null) return { label: "", title: undefined };
  return {
    label,
    title: Number.isFinite(raw) ? new Date(raw).toLocaleString() : undefined,
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
  emails?: InboxEmailListItem[];
  /** Support tickets interleaved in the same left list. */
  supportTasks?: InboxTaskListItem[];
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
  pane = "full",
}: CommunicationChatViewProps) {
  const [draft, setDraft] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [listFilters, setListFilters] = useState<CommunicationChatListFilters>(
    () => EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
  );
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const listSearchRef = useRef<HTMLInputElement | null>(null);
  const stickToBottomRef = useRef(true);
  const prevSelectedIdRef = useRef<string | null>(null);
  const filterContext = useMemo(
    () => ({
      resolveConversationContactId,
      resolveConversationOrganizationId,
    }),
    [resolveConversationContactId, resolveConversationOrganizationId],
  );
  const { statusGroups, draftEmailRows } = useMemo(() => {
    const filtered = filterCommunicationChatListGroupsByFilters(
      filterCommunicationChatListGroups(
        groupCommunicationChatListRows(conversations, emails, supportTasks),
        listQuery,
      ),
      listFilters,
      filterContext,
    );
    const peeled = peelCommunicationDraftEmailRows(filtered);
    return { statusGroups: peeled.groups, draftEmailRows: peeled.drafts };
  }, [
    conversations,
    emails,
    filterContext,
    listFilters,
    listQuery,
    supportTasks,
  ]);
  const listEmpty =
    conversations.length === 0 &&
    emails.length === 0 &&
    supportTasks.length === 0;
  const listQueryActive = listQuery.trim().length > 0;
  const listFiltersActive = communicationChatListFiltersAreActive(listFilters);
  const listQueryNeedle = listQuery.trim().toLowerCase();
  const showWhatsAppPlaceholder =
    !(listEmpty && loading) &&
    (listFilters.kind == null || listFilters.kind === "whatsapp") &&
    (!listQueryActive ||
      "whatsapp".includes(listQueryNeedle) ||
      WHATSAPP_PLACEHOLDER_TASK.title.toLowerCase().includes(listQueryNeedle));
  const listFilteredEmpty =
    !listEmpty &&
    (listQueryActive || listFiltersActive) &&
    statusGroups.length === 0 &&
    draftEmailRows.length === 0 &&
    !showWhatsAppPlaceholder;
  const emailSelected = Boolean(selectedEmailId);
  const supportSelected = Boolean(selectedSupportId);
  const selectedIsTyping =
    !emailSelected &&
    !supportSelected &&
    selectedId != null &&
    typingIds?.has(selectedId) === true;

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
        {error ? <p className="communication-chat__error">{error}</p> : null}
        <div className="communication-chat__list-toolbar">
          <div className="communication-chat__list-search">
            <span className="communication-chat__list-search-icon" aria-hidden="true">
              <SearchIcon size={14} />
            </span>
            <input
              ref={listSearchRef}
              type="search"
              className="communication-chat__list-search-input"
              value={listQuery}
              placeholder="Search chats and emails…"
              aria-label="Search chats and emails"
              onChange={(event) => setListQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                if (listQuery.length > 0) {
                  setListQuery("");
                  return;
                }
                listSearchRef.current?.blur();
              }}
            />
            {listQueryActive ? (
              <button
                type="button"
                className="communication-chat__list-search-clear"
                title="Clear search"
                aria-label="Clear search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setListQuery("");
                  listSearchRef.current?.focus();
                }}
              >
                <XCircleFillIcon size={14} />
              </button>
            ) : null}
          </div>
          <CommunicationChatListFilterMenu
            filters={listFilters}
            onFiltersChange={setListFilters}
            contactOptions={contactFilterOptions}
            organizationOptions={organizationFilterOptions}
            projectOptions={projectFilterOptions}
          />
        </div>
        <div className="communication-chat__list-scroll">
          {listEmpty && loading ? (
            <div className="communication-chat__empty">Loading…</div>
          ) : listEmpty && !showWhatsAppPlaceholder ? (
            <div className="communication-chat__empty">
              No chats, emails, or support tickets yet. Website widget chats,
              AgentMail messages, and support tickets show up here.
            </div>
          ) : listFilteredEmpty ? (
            <div className="communication-chat__empty">
              {listQueryActive
                ? `No items match “${listQuery.trim()}”.`
                : "No items match these filters."}
            </div>
          ) : (
            <ul
              className="overview-grouped-list communication-chat__task-list"
              aria-label="Chats, emails, WhatsApp, and support"
            >
              {showWhatsAppPlaceholder ? (
                <li
                  key={WHATSAPP_PLACEHOLDER_ID}
                  className={[
                    "project-tasks-list__card-item",
                    "task-kanban-card-item",
                    "communication-chat__card-item",
                    "communication-chat__card-item--placeholder",
                  ].join(" ")}
                >
                  <TaskBoardCard
                    task={WHATSAPP_PLACEHOLDER_TASK}
                    onOpen={() => undefined}
                    showDueDate={false}
                    showDisplayId={false}
                    showStatus={false}
                    leadingSlot={
                      <span
                        className="communication-chat__card-avatar-wrap"
                        title="WhatsApp"
                      >
                        <span
                          className="communication-chat__card-avatar"
                          aria-hidden="true"
                        >
                          <ContactPersonIcon
                            size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)}
                          />
                        </span>
                        <span
                          className="communication-chat__card-kind communication-chat__card-kind--whatsapp"
                          title="WhatsApp"
                          aria-label="WhatsApp"
                        >
                          <CommunicationWhatsAppKindIcon />
                        </span>
                      </span>
                    }
                    topLeadingSlot={
                      <span
                        className="communication-chat__card-name"
                        title="WhatsApp"
                      >
                        WhatsApp
                      </span>
                    }
                  />
                </li>
              ) : null}
              {draftEmailRows.map((row) => (
                <CommunicationEmailListCard
                  key={row.item.id}
                  item={row.item}
                  selectedEmailId={selectedEmailId}
                  resolveEmailAvatarSrc={resolveEmailAvatarSrc}
                  resolveContactAvatarSrc={resolveContactAvatarSrc}
                  onOpen={selectEmailAndCloseCreate}
                />
              ))}
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
                    {group.rows.map((row) => {
                      if (row.kind === "email") {
                        return (
                          <CommunicationEmailListCard
                            key={row.item.id}
                            item={row.item}
                            selectedEmailId={selectedEmailId}
                            resolveEmailAvatarSrc={resolveEmailAvatarSrc}
                            resolveContactAvatarSrc={resolveContactAvatarSrc}
                            onOpen={selectEmailAndCloseCreate}
                          />
                        );
                      }

                      if (row.kind === "support") {
                        const item = row.item;
                        const task = inboxListItemToTaskItemRowTask(item);
                        if (!task) return null;
                        const personLabel = supportListItemPartyName(item);
                        const avatarSrc = item.contactAvatarSrc?.trim() || null;
                        const avatarKind =
                          item.contactId?.trim()
                            ? "contact"
                            : item.organizationId?.trim()
                              ? "organization"
                              : "contact";
                        const age = supportAgeLabel(item);
                        const active = item.id === selectedSupportId;
                        return (
                          <li
                            key={item.id}
                            className={[
                              "project-tasks-list__card-item",
                              "task-kanban-card-item",
                              "communication-chat__card-item",
                              keyboardNavItemClass(active),
                              active
                                ? "communication-chat__card-item--active"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            {...keyboardNavItemProps(item.id)}
                          >
                            <TaskBoardCard
                              task={{
                                ...task,
                                title: item.title?.trim() || "Support ticket",
                              }}
                              onOpen={() => selectSupportAndCloseCreate(item.id)}
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
                                        kind={avatarKind}
                                      />
                                    ) : avatarKind === "organization" ? (
                                      <OrganizationIcon
                                        size={Math.round(
                                          CHAT_CARD_AVATAR_SIZE * 0.55,
                                        )}
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
                                    className="communication-chat__card-kind communication-chat__card-kind--support"
                                    title="Support"
                                    aria-label="Support"
                                  >
                                    <CommunicationSupportKindIcon />
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
                      }

                      const conversation = row.conversation;
                      const task =
                        chatConversationToTaskItemRowTask(conversation);
                      const preview =
                        conversation.lastMessagePreview?.trim() || "";
                      const personLabel =
                        conversation.contactName?.trim() ||
                        conversation.contactEmail?.trim() ||
                        conversation.contactPhone?.trim() ||
                        "Visitor";
                      const avatarSrc =
                        resolveAvatarSrc?.(conversation)?.trim() ||
                        conversation.contactAvatarUrl?.trim() ||
                        null;
                      const age = chatConversationAgeLabel(conversation);
                      const active =
                        !emailSelected &&
                        !supportSelected &&
                        conversation.id === selectedId;
                      const isTyping =
                        typingIds?.has(conversation.id) === true;
                      return (
                        <li
                          key={conversation.id}
                          className={[
                            "project-tasks-list__card-item",
                            "task-kanban-card-item",
                            "communication-chat__card-item",
                            keyboardNavItemClass(active),
                            active
                              ? "communication-chat__card-item--active"
                              : null,
                            conversation.unread
                              ? "communication-chat__card-item--unread"
                              : null,
                            isTyping
                              ? "communication-chat__card-item--typing"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {...keyboardNavItemProps(conversation.id)}
                        >
                          <TaskBoardCard
                            task={{
                              ...task,
                              // Title row shows the last message; name sits with age.
                              title: preview,
                            }}
                            onOpen={() => selectAndCloseCreate(conversation.id)}
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
                                    "communication-chat__card-kind--chat",
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
                                    <CommunicationChatKindIcon />
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
                  ) : (detail?.messages?.length ?? 0) === 0 &&
                    !selectedIsTyping ? (
                    <div className="communication-chat__empty">
                      No messages in this conversation yet.
                    </div>
                  ) : (
                    <>
                      {(detail?.messages ?? []).map((message) => (
                        <MessageBubble key={message.id} message={message} />
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
