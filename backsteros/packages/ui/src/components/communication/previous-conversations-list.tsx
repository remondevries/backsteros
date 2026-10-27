"use client";

import type { CommunicationChatListRow } from "../../communication/communication-chat-list-row.js";
import {
  previousCommunicationItemActivityAt,
  previousCommunicationItemId,
  previousCommunicationItemKind,
  previousCommunicationItemPreview,
  previousCommunicationItemTitle,
} from "../../communication/previous-communication-items.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { CommunicationKindMark } from "./communication-kind-icons.js";

const PREVIOUS_CONVERSATIONS_INITIAL_VISIBLE = 5;

function formatWhen(raw: string | number | null | undefined): string {
  if (raw == null || raw === "") return "";
  const d = typeof raw === "number" ? new Date(raw) : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type PreviousConversationsListProps = {
  items: readonly CommunicationChatListRow[];
  storageKey?: string;
  onSelectChat?: (conversationId: string) => void;
  onSelectEmail?: (emailId: string) => void;
  onSelectSupport?: (supportId: string) => void;
  /** Expand contact → Messages when more than the capped preview. */
  onViewAll?: () => void;
};

/**
 * Details-rail history: chats, emails, and support tickets with source icons.
 */
export function PreviousConversationsList({
  items,
  storageKey = "comm-details-previous",
  onSelectChat,
  onSelectEmail,
  onSelectSupport,
  onViewAll,
}: PreviousConversationsListProps) {
  const visibleItems = items.slice(0, PREVIOUS_CONVERSATIONS_INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const showViewAll = Boolean(onViewAll) && hiddenCount > 0;

  return (
    <EntityOverviewSubgroup
      title="Previous conversations"
      storageKey={storageKey}
    >
      {items.length === 0 ? (
        <p className="communication-chat-details__empty">
          No earlier messages with this contact.
        </p>
      ) : (
        <ul className="communication-chat-details__previous">
          {visibleItems.map((row) => {
            const id = previousCommunicationItemId(row);
            const kind = previousCommunicationItemKind(row);
            return (
              <li key={`${row.kind}:${id}`}>
                <button
                  type="button"
                  className="communication-chat-details__previous-row"
                  onClick={() => {
                    if (row.kind === "chat") onSelectChat?.(id);
                    else if (row.kind === "email") onSelectEmail?.(id);
                    else onSelectSupport?.(id);
                  }}
                >
                  <span className="communication-chat-details__previous-top">
                    <span className="communication-chat-details__previous-leading">
                      <CommunicationKindMark kind={kind} iconSize={11} />
                      <span className="communication-chat-details__previous-name">
                        {previousCommunicationItemTitle(row)}
                      </span>
                    </span>
                    <span className="communication-chat-details__previous-when">
                      {formatWhen(previousCommunicationItemActivityAt(row))}
                    </span>
                  </span>
                  <span className="communication-chat-details__previous-preview">
                    {previousCommunicationItemPreview(row)}
                  </span>
                </button>
              </li>
            );
          })}
          {showViewAll ? (
            <li className="status-group-show-more">
              <button
                type="button"
                className="status-group-show-more__btn"
                onClick={onViewAll}
                aria-label={`View all, ${hiddenCount} more`}
              >
                View all
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </EntityOverviewSubgroup>
  );
}
