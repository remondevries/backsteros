"use client";

import type { ChatConversation } from "@backsteros/contracts";

import { chatConversationToTaskItemRowTask } from "../../communication/chat-conversation-list-item.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { TaskBoardCard } from "../tasks/task-board-card.js";
import {
  CommunicationChannelKindIcon,
  communicationChannelKindClass,
  communicationChannelKindTitle,
} from "./communication-kind-icons.js";

export const CHAT_CARD_AVATAR_SIZE = 40;

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

export type CommunicationChatListCardProps = {
  conversation: ChatConversation;
  active: boolean;
  keyboardHighlighted: boolean;
  typing: boolean;
  avatarSrc?: string | null;
  onOpen: (conversationId: string) => void;
};

/** Chatwoot conversation card for the unified Messages list. */
export function CommunicationChatListCard({
  conversation,
  active,
  keyboardHighlighted,
  typing,
  avatarSrc: avatarSrcProp,
  onOpen,
}: CommunicationChatListCardProps) {
  const task = chatConversationToTaskItemRowTask(conversation);
  const preview = conversation.lastMessagePreview?.trim() || "";
  const personLabel =
    conversation.contactName?.trim() ||
    conversation.contactEmail?.trim() ||
    conversation.contactPhone?.trim() ||
    "Visitor";
  const avatarSrc =
    avatarSrcProp?.trim() || conversation.contactAvatarUrl?.trim() || null;
  const age = chatConversationAgeLabel(conversation);
  return (
    <li
      className={[
        "project-tasks-list__card-item",
        "task-kanban-card-item",
        "communication-chat__card-item",
        keyboardNavItemClass(keyboardHighlighted),
        active ? "communication-chat__card-item--active" : null,
        conversation.unread ? "communication-chat__card-item--unread" : null,
        typing ? "communication-chat__card-item--typing" : null,
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
        onOpen={() => onOpen(conversation.id)}
        showDueDate
        showDisplayId={false}
        showStatus={false}
        leadingSlot={
          <span
            className="communication-chat__card-avatar-wrap"
            title={personLabel}
          >
            <span className="communication-chat__card-avatar" aria-hidden="true">
              {avatarSrc ? (
                <EntityAvatarIcon
                  src={avatarSrc}
                  size={CHAT_CARD_AVATAR_SIZE}
                  kind="contact"
                />
              ) : (
                <ContactPersonIcon
                  size={Math.round(CHAT_CARD_AVATAR_SIZE * 0.55)}
                />
              )}
            </span>
            <span
              className={[
                "communication-chat__card-kind",
                communicationChannelKindClass(conversation.channelType, {
                  inboxName: conversation.inboxName,
                  contactName: conversation.contactName,
                }),
                typing ? "communication-chat__card-kind--typing" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title={communicationChannelKindTitle(
                conversation.channelType,
                typing,
                {
                  inboxName: conversation.inboxName,
                  contactName: conversation.contactName,
                },
              )}
              aria-label={
                typing
                  ? "Typing"
                  : communicationChannelKindTitle(conversation.channelType, {
                      inboxName: conversation.inboxName,
                      contactName: conversation.contactName,
                    })
              }
            >
              {typing ? (
                <ChatListTypingIcon />
              ) : (
                <CommunicationChannelKindIcon
                  channelType={conversation.channelType}
                  inboxName={conversation.inboxName}
                  contactName={conversation.contactName}
                />
              )}
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
