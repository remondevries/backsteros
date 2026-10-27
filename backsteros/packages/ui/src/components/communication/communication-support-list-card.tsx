"use client";

import { supportListItemPartyName } from "../../communication/communication-chat-list-row.js";
import {
  inboxListItemToTaskItemRowTask,
  type InboxTaskListItem,
} from "../../inbox/inbox-items.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";
import { CommunicationSupportKindIcon } from "./communication-kind-icons.js";

const CHAT_CARD_AVATAR_SIZE = 40;

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

export type CommunicationSupportListCardProps = {
  item: InboxTaskListItem;
  selectedSupportId?: string | null;
  keyboardHighlighted?: boolean;
  onOpen: (supportId: string) => void;
};

/**
 * Shared Messages list card for support tickets — Communication and
 * Inbox → Messages.
 */
export function CommunicationSupportListCard({
  item,
  selectedSupportId,
  keyboardHighlighted = false,
  onOpen,
}: CommunicationSupportListCardProps) {
  const task = inboxListItemToTaskItemRowTask(item);
  if (!task) return null;
  const personLabel = supportListItemPartyName(item);
  const avatarSrc = item.contactAvatarSrc?.trim() || null;
  const avatarKind = item.contactId?.trim()
    ? "contact"
    : item.organizationId?.trim()
      ? "organization"
      : "contact";
  const age = supportAgeLabel(item);
  const active = item.id === selectedSupportId;
  return (
    <li
      className={[
        "project-tasks-list__card-item",
        "task-kanban-card-item",
        "communication-chat__card-item",
        keyboardNavItemClass(keyboardHighlighted),
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
        onOpen={() => onOpen(item.id)}
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
                  size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)}
                />
              ) : (
                <ContactPersonIcon
                  size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)}
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
