import type { ChatConversation } from "@backsteros/contracts";

import { resolveChatChannelKind } from "./chat-channel-kind.js";
import {
  communicationChatListRowActivityMs,
  emailListItemPartyName,
  supportListItemPartyName,
  type CommunicationChatListRow,
} from "./communication-chat-list-row.js";
import type {
  InboxEmailListItem,
  InboxTaskListItem,
} from "../inbox/inbox-items.js";
import type { CommunicationKind } from "../components/communication/communication-kind-icons.js";

export function previousCommunicationItemId(
  row: CommunicationChatListRow,
): string {
  return row.kind === "chat" ? row.conversation.id : row.item.id;
}

/** Kind mark used for previous-conversation source icons. */
export function previousCommunicationItemKind(
  row: CommunicationChatListRow,
): CommunicationKind {
  if (row.kind === "email") return "email";
  if (row.kind === "support") return "support";
  return resolveChatChannelKind(row.conversation.channelType, {
    inboxName: row.conversation.inboxName,
    contactName: row.conversation.contactName,
  });
}

export function previousCommunicationItemTitle(
  row: CommunicationChatListRow,
): string {
  if (row.kind === "chat") {
    const conversation = row.conversation;
    return (
      conversation.contactName?.trim() ||
      conversation.contactEmail?.trim() ||
      conversation.contactPhone?.trim() ||
      `Chat ${conversation.externalId}`
    );
  }
  if (row.kind === "email") {
    return row.item.title?.trim() || emailListItemPartyName(row.item) || "Email";
  }
  return row.item.title?.trim() || supportListItemPartyName(row.item) || "Support";
}

export function previousCommunicationItemPreview(
  row: CommunicationChatListRow,
): string {
  if (row.kind === "chat") {
    return (
      row.conversation.lastMessagePreview?.trim() || row.conversation.status
    );
  }
  if (row.kind === "email") {
    return (
      emailListItemPartyName(row.item) ||
      row.item.partyLabel?.trim() ||
      row.item.status
    );
  }
  return supportListItemPartyName(row.item) || row.item.status;
}

export function previousCommunicationItemActivityAt(
  row: CommunicationChatListRow,
): string | number | null {
  if (row.kind === "chat") {
    return row.conversation.lastActivityAt ?? row.conversation.updatedAt ?? null;
  }
  return row.item.updatedAt ?? null;
}

/**
 * Flat history for the Details “Previous conversations” list — chats, emails,
 * and support tickets interleaved by last activity (newest first). Caller
 * supplies already-scoped sources; this only excludes the open item and sorts.
 */
export function previousCommunicationItems(input: {
  conversations?: readonly ChatConversation[];
  emails?: readonly InboxEmailListItem[];
  supportTasks?: readonly InboxTaskListItem[];
  excludeId?: string | null;
}): CommunicationChatListRow[] {
  const excludeId = input.excludeId?.trim() || null;
  const rows: CommunicationChatListRow[] = [
    ...(input.conversations ?? []).map(
      (conversation): CommunicationChatListRow => ({
        kind: "chat",
        conversation,
      }),
    ),
    ...(input.emails ?? []).map(
      (item): CommunicationChatListRow => ({ kind: "email", item }),
    ),
    ...(input.supportTasks ?? []).map(
      (item): CommunicationChatListRow => ({ kind: "support", item }),
    ),
  ];
  return rows
    .filter((row) => previousCommunicationItemId(row) !== excludeId)
    .sort(
      (left, right) =>
        communicationChatListRowActivityMs(right) -
        communicationChatListRowActivityMs(left),
    );
}
