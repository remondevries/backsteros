"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatConversation } from "@backsteros/contracts";
import { SearchIcon, XCircleFillIcon } from "@primer/octicons-react";

import { resolveChatChannelKind } from "../../communication/chat-channel-kind.js";
import {
  chatStatusToTaskStatus,
  type ChatListStatus,
} from "../../communication/chat-conversation-list-item.js";
import {
  EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
  communicationChatListFiltersAreActive,
  filterCommunicationChatListGroupsByFilters,
  type CommunicationChatListFilters,
} from "../../communication/communication-chat-list-filters.js";
import {
  communicationChatListKeyboardItemIds,
  communicationChatListVisibleRowIds,
  filterCommunicationChatListGroups,
  groupCommunicationChatListRows,
  peelCommunicationDraftEmailRows,
} from "../../communication/communication-chat-list-row.js";
import type {
  InboxEmailListItem,
  InboxTaskListItem,
} from "../../inbox/inbox-items.js";
import {
  LIST_KEYBOARD_NAV_ZONE_MAIN,
  type ListKeyboardNavZone,
} from "../../list-nav/list-keyboard-nav-zone.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import {
  CHAT_CARD_AVATAR_SIZE,
  CommunicationChatListCard,
} from "./communication-chat-list-card.js";
import { CommunicationChatListFilterMenu } from "./communication-chat-list-filter-menu.js";
import { CommunicationEmailListCard } from "./communication-email-list-card.js";
import { CommunicationWhatsAppKindIcon } from "./communication-kind-icons.js";
import { CommunicationSupportListCard } from "./communication-support-list-card.js";

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

const NO_HIDDEN_STATUSES: readonly ChatListStatus[] = [];

export type CommunicationMessagesListProps = {
  conversations: readonly ChatConversation[];
  emails?: readonly InboxEmailListItem[];
  supportTasks?: readonly InboxTaskListItem[];
  selectedChatId?: string | null;
  selectedEmailId?: string | null;
  selectedSupportId?: string | null;
  loading?: boolean;
  error?: string | null;
  typingIds?: ReadonlySet<string>;
  resolveAvatarSrc?: (conversation: ChatConversation) => string | null | undefined;
  resolveEmailAvatarSrc?: (item: InboxEmailListItem) => string | null | undefined;
  resolveContactAvatarSrc?: (contactId: string) => string | null | undefined;
  resolveConversationContactId?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  resolveConversationOrganizationId?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  contactFilterOptions?: readonly SearchableDropdownOption<string>[];
  organizationFilterOptions?: readonly SearchableDropdownOption<string>[];
  projectFilterOptions?: readonly SearchableDropdownOption<string>[];
  onSelectChat: (conversationId: string) => void;
  onSelectEmail?: (emailId: string) => void;
  onSelectSupport?: (supportId: string) => void;
  /** Row ids in on-screen order (after search/filters/collapse). */
  onVisibleRowIdsChange?: (rowIds: readonly string[]) => void;
  /** j/k order (skips collapsed groups). */
  onKeyboardItemIdsChange?: (rowIds: readonly string[]) => void;
  /** Keyboard highlight moved (Inbox opens the highlighted row). */
  onHighlightChange?: (rowId: string | null) => void;
  /** Status buckets never shown (Inbox hides `resolved` / Completed). */
  hiddenStatuses?: readonly ChatListStatus[];
  /** Dashed WhatsApp placeholder card above the list. */
  showWhatsAppPlaceholder?: boolean;
  /** Search + filter toolbar above the list. */
  showToolbar?: boolean;
  keyboardZone?: ListKeyboardNavZone;
  keyboardEnabled?: boolean;
  /** Replaces the default empty copy when there are no rows at all. */
  emptyState?: ReactNode;
};

/**
 * Unified Messages list — chats, emails, and support tickets grouped by
 * Triage / Waiting / In Review / On Hold / Completed. Shared by
 * Communication and Inbox → Messages.
 */
export function CommunicationMessagesList({
  conversations,
  emails = [],
  supportTasks = [],
  selectedChatId = null,
  selectedEmailId = null,
  selectedSupportId = null,
  loading = false,
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
  onSelectChat,
  onSelectEmail,
  onSelectSupport,
  onVisibleRowIdsChange,
  onKeyboardItemIdsChange,
  onHighlightChange,
  hiddenStatuses = NO_HIDDEN_STATUSES,
  showWhatsAppPlaceholder: allowWhatsAppPlaceholder = true,
  showToolbar = true,
  keyboardZone = LIST_KEYBOARD_NAV_ZONE_MAIN,
  keyboardEnabled = true,
  emptyState,
}: CommunicationMessagesListProps) {
  const [listQuery, setListQuery] = useState("");
  const [listFilters, setListFilters] = useState<CommunicationChatListFilters>(
    () => EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const listSearchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const filterContext = useMemo(
    () => ({
      resolveConversationContactId,
      resolveConversationOrganizationId,
    }),
    [resolveConversationContactId, resolveConversationOrganizationId],
  );
  const hiddenKey = hiddenStatuses.join(",");
  const { statusGroups, draftEmailRows } = useMemo(() => {
    const hidden = new Set<string>(hiddenKey ? hiddenKey.split(",") : []);
    const grouped = groupCommunicationChatListRows(
      conversations,
      emails,
      supportTasks,
    ).filter((group) => !hidden.has(group.status));
    const filtered = filterCommunicationChatListGroupsByFilters(
      filterCommunicationChatListGroups(grouped, listQuery),
      listFilters,
      filterContext,
    );
    const peeled = peelCommunicationDraftEmailRows(filtered);
    return { statusGroups: peeled.groups, draftEmailRows: peeled.drafts };
  }, [
    conversations,
    emails,
    filterContext,
    hiddenKey,
    listFilters,
    listQuery,
    supportTasks,
  ]);

  useEffect(() => {
    onVisibleRowIdsChange?.(
      communicationChatListVisibleRowIds({
        drafts: draftEmailRows,
        groups: statusGroups,
      }),
    );
  }, [draftEmailRows, onVisibleRowIdsChange, statusGroups]);

  const listContainerProps =
    useListKeyboardNavigationContainerProps(keyboardZone);
  const keyboardItemIds = useMemo(
    () =>
      communicationChatListKeyboardItemIds(
        { drafts: draftEmailRows, groups: statusGroups },
        collapsedGroups,
      ),
    [collapsedGroups, draftEmailRows, statusGroups],
  );
  useEffect(() => {
    onKeyboardItemIdsChange?.(keyboardItemIds);
  }, [keyboardItemIds, onKeyboardItemIdsChange]);

  const rowKindById = useMemo(() => {
    const kinds = new Map<string, "chat" | "email" | "support">();
    for (const row of draftEmailRows) {
      kinds.set(row.item.id, "email");
    }
    for (const group of statusGroups) {
      for (const row of group.rows) {
        if (row.kind === "chat") kinds.set(row.conversation.id, "chat");
        else kinds.set(row.item.id, row.kind);
      }
    }
    return kinds;
  }, [draftEmailRows, statusGroups]);

  const selectedListId =
    selectedEmailId ?? selectedSupportId ?? selectedChatId ?? null;
  const listEmpty =
    conversations.length === 0 &&
    emails.length === 0 &&
    supportTasks.length === 0;
  const visibleEmpty = statusGroups.length === 0 && draftEmailRows.length === 0;
  const listQueryActive = listQuery.trim().length > 0;
  const listFiltersActive = communicationChatListFiltersAreActive(listFilters);
  const listQueryNeedle = listQuery.trim().toLowerCase();
  const hasWhatsAppConversation = conversations.some(
    (conversation) =>
      resolveChatChannelKind(conversation.channelType, {
        inboxName: conversation.inboxName,
        contactName: conversation.contactName,
      }) === "whatsapp",
  );
  const showWhatsAppPlaceholder =
    allowWhatsAppPlaceholder &&
    !hasWhatsAppConversation &&
    !(listEmpty && loading) &&
    (listFilters.kind == null || listFilters.kind === "whatsapp") &&
    (!listQueryActive ||
      "whatsapp".includes(listQueryNeedle) ||
      WHATSAPP_PLACEHOLDER_TASK.title.toLowerCase().includes(listQueryNeedle));
  const listFilteredEmpty =
    !listEmpty &&
    (listQueryActive || listFiltersActive) &&
    visibleEmpty &&
    !showWhatsAppPlaceholder;
  const nothingToShow =
    visibleEmpty && !showWhatsAppPlaceholder && !listFilteredEmpty;
  const emailSelected = Boolean(selectedEmailId);
  const supportSelected = Boolean(selectedSupportId);

  function toggleGroup(status: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function openRow(itemId: string) {
    const kind = rowKindById.get(itemId);
    if (kind === "email") {
      onSelectEmail?.(itemId);
      return;
    }
    if (kind === "support") {
      onSelectSupport?.(itemId);
      return;
    }
    onSelectChat(itemId);
  }

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId: selectedListId,
    onNavigate: openRow,
    zone: keyboardZone,
    enabled: keyboardEnabled && keyboardItemIds.length > 0,
  });
  useEffect(() => {
    onHighlightChange?.(highlightedId);
  }, [highlightedId, onHighlightChange]);

  return (
    <div
      className={[
        "communication-chat__messages-list",
        showToolbar ? null : "communication-chat__messages-list--no-toolbar",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {error ? <p className="communication-chat__error">{error}</p> : null}
      {showToolbar ? (
        <div className="communication-chat__list-toolbar">
          <div className="communication-chat__list-search">
            <span
              className="communication-chat__list-search-icon"
              aria-hidden="true"
            >
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
      ) : null}
      <div className="communication-chat__list-scroll">
        {listEmpty && loading ? (
          <div className="communication-chat__empty">Loading…</div>
        ) : nothingToShow ? (
          (emptyState ?? (
            <div className="communication-chat__empty">
              No chats, emails, or support tickets yet. Website widget chats,
              AgentMail messages, and support tickets show up here.
            </div>
          ))
        ) : listFilteredEmpty ? (
          <div className="communication-chat__empty">
            {listQueryActive
              ? `No items match “${listQuery.trim()}”.`
              : "No items match these filters."}
          </div>
        ) : (
          <ul
            ref={listRef}
            className="overview-grouped-list communication-chat__task-list"
            aria-label="Chats, emails, WhatsApp, and support"
            {...listContainerProps}
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
                keyboardHighlighted={highlightedId === row.item.id}
                resolveEmailAvatarSrc={resolveEmailAvatarSrc}
                resolveContactAvatarSrc={resolveContactAvatarSrc}
                onOpen={(emailId) => onSelectEmail?.(emailId)}
              />
            ))}
            {statusGroups.map((group) => (
              <StatusGroupSection
                key={group.status}
                groupKey={chatStatusToTaskStatus(group.status)}
                title={group.label}
                collapsed={collapsedGroups.has(group.status)}
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
                        keyboardHighlighted={highlightedId === row.item.id}
                        resolveEmailAvatarSrc={resolveEmailAvatarSrc}
                        resolveContactAvatarSrc={resolveContactAvatarSrc}
                        onOpen={(emailId) => onSelectEmail?.(emailId)}
                      />
                    );
                  }
                  if (row.kind === "support") {
                    return (
                      <CommunicationSupportListCard
                        key={row.item.id}
                        item={row.item}
                        selectedSupportId={selectedSupportId}
                        keyboardHighlighted={highlightedId === row.item.id}
                        onOpen={(supportId) => onSelectSupport?.(supportId)}
                      />
                    );
                  }
                  const conversation = row.conversation;
                  return (
                    <CommunicationChatListCard
                      key={conversation.id}
                      conversation={conversation}
                      active={
                        !emailSelected &&
                        !supportSelected &&
                        conversation.id === selectedChatId
                      }
                      keyboardHighlighted={highlightedId === conversation.id}
                      typing={typingIds?.has(conversation.id) === true}
                      avatarSrc={resolveAvatarSrc?.(conversation) ?? null}
                      onOpen={onSelectChat}
                    />
                  );
                })}
              </StatusGroupSection>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
