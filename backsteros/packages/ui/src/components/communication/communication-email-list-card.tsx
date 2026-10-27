"use client";

import {
  emailListItemPartyName,
} from "../../communication/communication-chat-list-row.js";
import {
  inboxListItemToTaskItemRowTask,
  type InboxEmailListItem,
} from "../../inbox/inbox-items.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";

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

export type CommunicationEmailListCardProps = {
  item: InboxEmailListItem;
  selectedEmailId?: string | null;
  keyboardHighlighted?: boolean;
  resolveEmailAvatarSrc?: (item: InboxEmailListItem) => string | null | undefined;
  resolveContactAvatarSrc?: (contactId: string) => string | null | undefined;
  onOpen: (emailId: string) => void;
};

/**
 * Shared Messages list card — Communication side panel and Inbox → Messages.
 */
export function CommunicationEmailListCard({
  item,
  selectedEmailId,
  keyboardHighlighted = false,
  resolveEmailAvatarSrc,
  resolveContactAvatarSrc,
  onOpen,
}: CommunicationEmailListCardProps) {
  const task = inboxListItemToTaskItemRowTask(item);
  if (!task) return null;
  const personLabel = emailListItemPartyName(item);
  const avatarSrc =
    resolveEmailAvatarSrc?.(item)?.trim() ||
    item.mailboxAvatarSrc?.trim() ||
    null;
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
        keyboardNavItemClass(keyboardHighlighted),
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
