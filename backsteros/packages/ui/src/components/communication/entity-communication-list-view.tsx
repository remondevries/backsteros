"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ChatConversation } from "@backsteros/contracts";

import {
  chatConversationToTaskItemRowTask,
  chatStatusToTaskStatus,
} from "../../communication/chat-conversation-list-item.js";
import {
  emailListItemPartyName,
  groupCommunicationChatListRows,
  peelCommunicationDraftEmailRows,
  supportListItemPartyName,
  type CommunicationChatListRow,
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
import {
  CommunicationChatKindIcon,
  CommunicationSupportKindIcon,
  CommunicationWhatsAppKindIcon,
} from "./communication-kind-icons.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

const CHAT_CARD_AVATAR_SIZE = 40;

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

function ageLabel(raw: string | number | null | undefined): {
  label: string;
  title: string | undefined;
} {
  const label = formatRelativeAgeLabel(raw);
  if (!label || raw == null) return { label: "", title: undefined };
  const ms = typeof raw === "number" ? raw : new Date(raw).getTime();
  return {
    label,
    title: Number.isFinite(ms) ? new Date(ms).toLocaleString() : undefined,
  };
}

export type EntityCommunicationListViewProps = {
  conversations?: readonly ChatConversation[];
  emails?: readonly InboxEmailListItem[];
  supportTasks?: readonly InboxTaskListItem[];
  selectedId?: string | null;
  selectedEmailId?: string | null;
  selectedSupportId?: string | null;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  showWhatsAppPlaceholder?: boolean;
  resolveAvatarSrc?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  resolveEmailAvatarSrc?: (
    item: InboxEmailListItem,
  ) => string | null | undefined;
  onSelectChat?: (conversationId: string) => void;
  onSelectEmail?: (emailId: string) => void;
  onSelectSupport?: (supportId: string) => void;
};

/**
 * Contact / org Communication workspace tab — same cards as the main
 * Communication list (kind badges, draft dashed style, WhatsApp placeholder).
 */
export function EntityCommunicationListView({
  conversations = [],
  emails = [],
  supportTasks = [],
  selectedId = null,
  selectedEmailId = null,
  selectedSupportId = null,
  loading = false,
  emptyMessage = "No communication yet",
  emptyHint = "Chats, emails, and support tickets for this contact will show up here.",
  showWhatsAppPlaceholder = true,
  resolveAvatarSrc,
  resolveEmailAvatarSrc,
  onSelectChat,
  onSelectEmail,
  onSelectSupport,
}: EntityCommunicationListViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set<string>());

  const { statusGroups, draftEmailRows } = useMemo(() => {
    const grouped = groupCommunicationChatListRows(
      conversations,
      emails,
      supportTasks,
    );
    const peeled = peelCommunicationDraftEmailRows(grouped);
    return { statusGroups: peeled.groups, draftEmailRows: peeled.drafts };
  }, [conversations, emails, supportTasks]);

  const listEmpty =
    conversations.length === 0 &&
    emails.length === 0 &&
    supportTasks.length === 0;
  const showWhatsApp =
    showWhatsAppPlaceholder && !(listEmpty && loading);

  function toggleGroup(status: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  if (listEmpty && !loading && !showWhatsApp) {
    return (
      <div className="contact-tasks-list__empty">
        <h2 className="contact-tasks-list__empty-title">{emptyMessage}</h2>
        <p className="contact-tasks-list__empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div
      className="contact-tasks-list-host communication-chat__entity-list"
      aria-label="Communication"
    >
      <ul
        className="overview-grouped-list communication-chat__task-list contact-tasks-list"
        role="list"
      >
        {showWhatsApp ? (
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
                <span className="communication-chat__card-name" title="WhatsApp">
                  WhatsApp
                </span>
              }
            />
          </li>
        ) : null}
        {draftEmailRows.map((row) => (
          <EmailCard
            key={row.item.id}
            item={row.item}
            selectedEmailId={selectedEmailId}
            resolveEmailAvatarSrc={resolveEmailAvatarSrc}
            onOpen={onSelectEmail}
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
              {group.rows.map((row) =>
                renderRow(row, {
                  selectedId,
                  selectedEmailId,
                  selectedSupportId,
                  resolveAvatarSrc,
                  resolveEmailAvatarSrc,
                  onSelectChat,
                  onSelectEmail,
                  onSelectSupport,
                }),
              )}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}

function renderRow(
  row: CommunicationChatListRow,
  ctx: {
    selectedId: string | null;
    selectedEmailId: string | null;
    selectedSupportId: string | null;
    resolveAvatarSrc?: EntityCommunicationListViewProps["resolveAvatarSrc"];
    resolveEmailAvatarSrc?: EntityCommunicationListViewProps["resolveEmailAvatarSrc"];
    onSelectChat?: (id: string) => void;
    onSelectEmail?: (id: string) => void;
    onSelectSupport?: (id: string) => void;
  },
): ReactNode {
  if (row.kind === "email") {
    return (
      <EmailCard
        key={row.item.id}
        item={row.item}
        selectedEmailId={ctx.selectedEmailId}
        resolveEmailAvatarSrc={ctx.resolveEmailAvatarSrc}
        onOpen={ctx.onSelectEmail}
      />
    );
  }

  if (row.kind === "support") {
    const item = row.item;
    const task = inboxListItemToTaskItemRowTask(item);
    if (!task) return null;
    const personLabel = supportListItemPartyName(item);
    const avatarSrc = item.contactAvatarSrc?.trim() || null;
    const avatarKind = item.contactId?.trim()
      ? "contact"
      : item.organizationId?.trim()
        ? "organization"
        : "contact";
    const age = ageLabel(item.updatedAt);
    const active = item.id === ctx.selectedSupportId;
    return (
      <li
        key={item.id}
        className={[
          "project-tasks-list__card-item",
          "task-kanban-card-item",
          "communication-chat__card-item",
          keyboardNavItemClass(active),
          active ? "communication-chat__card-item--active" : null,
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
          onOpen={() => ctx.onSelectSupport?.(item.id)}
          showDueDate
          showDisplayId={false}
          showStatus={false}
          leadingSlot={
            <KindAvatar
              personLabel={personLabel}
              avatarSrc={avatarSrc}
              avatarKind={avatarKind}
              kindBadge={
                <span
                  className="communication-chat__card-kind communication-chat__card-kind--support"
                  title="Support"
                  aria-label="Support"
                >
                  <CommunicationSupportKindIcon />
                </span>
              }
            />
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
        />
      </li>
    );
  }

  const conversation = row.conversation;
  const task = chatConversationToTaskItemRowTask(conversation);
  const preview = conversation.lastMessagePreview?.trim() || "";
  const personLabel =
    conversation.contactName?.trim() ||
    conversation.contactEmail?.trim() ||
    conversation.contactPhone?.trim() ||
    "Visitor";
  const avatarSrc =
    ctx.resolveAvatarSrc?.(conversation)?.trim() ||
    conversation.contactAvatarUrl?.trim() ||
    null;
  const age = ageLabel(conversation.lastActivityAt ?? conversation.updatedAt);
  const active =
    !ctx.selectedEmailId &&
    !ctx.selectedSupportId &&
    conversation.id === ctx.selectedId;
  return (
    <li
      key={conversation.id}
      className={[
        "project-tasks-list__card-item",
        "task-kanban-card-item",
        "communication-chat__card-item",
        keyboardNavItemClass(active),
        active ? "communication-chat__card-item--active" : null,
        conversation.unread ? "communication-chat__card-item--unread" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(conversation.id)}
    >
      <TaskBoardCard
        task={{
          ...task,
          title: preview,
        }}
        onOpen={() => ctx.onSelectChat?.(conversation.id)}
        showDueDate
        showDisplayId={false}
        showStatus={false}
        leadingSlot={
          <KindAvatar
            personLabel={personLabel}
            avatarSrc={avatarSrc}
            avatarKind="contact"
            kindBadge={
              <span
                className="communication-chat__card-kind communication-chat__card-kind--chat"
                title="Chat"
                aria-label="Chat"
              >
                <CommunicationChatKindIcon />
              </span>
            }
          />
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
      />
    </li>
  );
}

function EmailCard({
  item,
  selectedEmailId,
  resolveEmailAvatarSrc,
  onOpen,
}: {
  item: InboxEmailListItem;
  selectedEmailId: string | null;
  resolveEmailAvatarSrc?: EntityCommunicationListViewProps["resolveEmailAvatarSrc"];
  onOpen?: (emailId: string) => void;
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
  const age = ageLabel(item.updatedAt);
  const active = item.id === selectedEmailId;
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
        onOpen={() => onOpen?.(item.id)}
        showDueDate
        showDisplayId={false}
        showStatus={false}
        showEmailMark={false}
        leadingSlot={
          <KindAvatar
            personLabel={personLabel}
            avatarSrc={avatarSrc}
            avatarKind={avatarKind}
            kindBadge={
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
            }
          />
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
      />
    </li>
  );
}

function KindAvatar({
  personLabel,
  avatarSrc,
  avatarKind,
  kindBadge,
}: {
  personLabel: string;
  avatarSrc: string | null;
  avatarKind: "contact" | "organization";
  kindBadge: ReactNode;
}) {
  return (
    <span className="communication-chat__card-avatar-wrap" title={personLabel}>
      <span className="communication-chat__card-avatar" aria-hidden="true">
        {avatarSrc ? (
          <EntityAvatarIcon
            src={avatarSrc}
            size={CHAT_CARD_AVATAR_SIZE}
            kind={avatarKind}
          />
        ) : avatarKind === "organization" ? (
          <OrganizationIcon size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)} />
        ) : (
          <ContactPersonIcon size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)} />
        )}
      </span>
      {kindBadge}
    </span>
  );
}
