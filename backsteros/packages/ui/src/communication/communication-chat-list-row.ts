import type { ChatConversation } from "@backsteros/contracts";

import type { InboxEmailListItem } from "../inbox/inbox-items.js";
import { migrateLegacyTaskStatus } from "../tasks/task-status.js";
import { parseReplyToAddress } from "../email/email.js";
import {
  CHAT_LIST_STATUS_ORDER,
  getChatListStatusLabel,
  taskStatusToChatStatus,
  type ChatListStatus,
} from "./chat-conversation-list-item.js";

export type CommunicationChatListRow =
  | { kind: "chat"; conversation: ChatConversation }
  | { kind: "email"; item: InboxEmailListItem };

export type CommunicationChatListStatusGroup = {
  status: ChatListStatus;
  label: string;
  rows: CommunicationChatListRow[];
};

/**
 * Map an email task-status into the shared chat list buckets
 * (Triage / Waiting / On Hold / Completed).
 */
export function emailStatusToChatListStatus(
  status: string | null | undefined,
): ChatListStatus {
  return taskStatusToChatStatus(migrateLegacyTaskStatus(status?.trim() || "triage"));
}

/** Bare party address from `Name (email)` / angle / plain party labels. */
export function emailListItemPartyEmail(
  item: Pick<InboxEmailListItem, "partyLabel">,
): string | null {
  const label = item.partyLabel?.trim();
  if (!label) return null;
  const paren = label.match(/\(([^)]+@[^)]+)\)\s*$/);
  if (paren?.[1]) return paren[1].trim();
  if (label.includes("@")) {
    const parsed = parseReplyToAddress(label);
    return parsed.includes("@") ? parsed : null;
  }
  return null;
}

/** Display name for the card top line (without the address suffix). */
export function emailListItemPartyName(
  item: Pick<InboxEmailListItem, "partyLabel" | "contactName">,
): string {
  const linked = item.contactName?.trim();
  if (linked) return linked;
  const label = item.partyLabel?.trim();
  if (!label) return "Email";
  const paren = label.match(/^(.*?)\s*\([^)]+@[^)]+\)\s*$/);
  if (paren?.[1]?.trim()) return paren[1].trim();
  if (label.includes("@")) {
    const before = label.split("@")[0]?.trim();
    return before || label;
  }
  return label;
}

function chatActivityMs(row: ChatConversation): number {
  const raw = row.lastActivityAt ?? row.updatedAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function emailActivityMs(item: InboxEmailListItem): number {
  const ms = item.updatedAt;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
}

export function communicationChatListRowActivityMs(
  row: CommunicationChatListRow,
): number {
  return row.kind === "chat"
    ? chatActivityMs(row.conversation)
    : emailActivityMs(row.item);
}

function rowChatListStatus(row: CommunicationChatListRow): ChatListStatus {
  if (row.kind === "chat") {
    return (
      CHAT_LIST_STATUS_ORDER.includes(row.conversation.status as ChatListStatus)
        ? row.conversation.status
        : "open"
    ) as ChatListStatus;
  }
  return emailStatusToChatListStatus(row.item.status);
}

function sortRowsByRecency(rows: CommunicationChatListRow[]): CommunicationChatListRow[] {
  return [...rows].sort(
    (left, right) =>
      communicationChatListRowActivityMs(right) -
      communicationChatListRowActivityMs(left),
  );
}

/**
 * Build a single Triage / Waiting / On Hold / Completed list with chats and
 * emails interleaved by last activity within each status group.
 */
export function groupCommunicationChatListRows(
  conversations: readonly ChatConversation[],
  emails: readonly InboxEmailListItem[],
): CommunicationChatListStatusGroup[] {
  const buckets = new Map<ChatListStatus, CommunicationChatListRow[]>(
    CHAT_LIST_STATUS_ORDER.map((status) => [status, []]),
  );

  for (const conversation of conversations) {
    const row: CommunicationChatListRow = { kind: "chat", conversation };
    buckets.get(rowChatListStatus(row))!.push(row);
  }
  for (const item of emails) {
    const row: CommunicationChatListRow = { kind: "email", item };
    buckets.get(rowChatListStatus(row))!.push(row);
  }

  return CHAT_LIST_STATUS_ORDER.flatMap((status) => {
    const group = buckets.get(status) ?? [];
    if (group.length === 0) return [];
    return [
      {
        status,
        label: getChatListStatusLabel(status),
        rows: sortRowsByRecency(group),
      },
    ];
  });
}

/** Flat ordered ids for keyboard nav across the unified list. */
export function communicationChatListRowIds(
  groups: readonly CommunicationChatListStatusGroup[],
): string[] {
  return groups.flatMap((group) =>
    group.rows.map((row) =>
      row.kind === "chat" ? row.conversation.id : row.item.id,
    ),
  );
}
