import type { ChatConversation } from "@backsteros/contracts";

import {
  chatConversationToInboxListItem,
  type ChatListStatus,
} from "../communication/chat-conversation-list-item.js";
import {
  groupCommunicationChatListRows,
  peelCommunicationDraftEmailRows,
  type CommunicationChatListRow,
} from "../communication/communication-chat-list-row.js";
import type {
  InboxEmailListItem,
  InboxListItem,
  InboxTaskListItem,
} from "./inbox-items.js";

/** Inbox → Messages is Communication minus the Completed bucket. */
export const INBOX_MESSAGES_HIDDEN_STATUSES: readonly ChatListStatus[] = [
  "resolved",
];

export type InboxMessagesSources = {
  conversations: readonly ChatConversation[];
  emails: readonly InboxEmailListItem[];
  supportTasks: readonly InboxTaskListItem[];
};

function rowToInboxListItem(row: CommunicationChatListRow): InboxListItem {
  return row.kind === "chat"
    ? chatConversationToInboxListItem(row.conversation)
    : row.item;
}

/**
 * Inbox → Messages rows in on-screen order (drafts, then Triage / Waiting /
 * In Review / On Hold) — the same order `CommunicationMessagesList` paints,
 * so "next row after removing" and first-row landing agree with the list.
 */
export function buildInboxMessagesModeItems(
  sources: InboxMessagesSources,
  hiddenStatuses: readonly ChatListStatus[] = INBOX_MESSAGES_HIDDEN_STATUSES,
): InboxListItem[] {
  const hidden = new Set<string>(hiddenStatuses);
  const groups = groupCommunicationChatListRows(
    sources.conversations,
    sources.emails,
    sources.supportTasks,
  ).filter((group) => !hidden.has(group.status));
  const peeled = peelCommunicationDraftEmailRows(groups);
  return [
    ...peeled.drafts.map(rowToInboxListItem),
    ...peeled.groups.flatMap((group) => group.rows.map(rowToInboxListItem)),
  ];
}
