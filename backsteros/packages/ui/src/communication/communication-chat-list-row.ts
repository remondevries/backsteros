import type { ChatConversation } from "@backsteros/contracts";

import type {
  InboxEmailListItem,
  InboxTaskListItem,
} from "../inbox/inbox-items.js";
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
  | { kind: "email"; item: InboxEmailListItem }
  | { kind: "support"; item: InboxTaskListItem };

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
  const raw = status?.trim() || "triage";
  if (raw === "concept") return "open";
  return taskStatusToChatStatus(migrateLegacyTaskStatus(raw));
}

/** Standalone compose drafts (dashed cards above Triage). */
export function isCommunicationEmailDraft(
  item: Pick<InboxEmailListItem, "draftId" | "status">,
): boolean {
  return Boolean(item.draftId?.trim()) || item.status === "concept";
}

/**
 * Lift draft email rows out of status groups so they render above Triage.
 */
export function peelCommunicationDraftEmailRows(
  groups: readonly CommunicationChatListStatusGroup[],
): {
  drafts: Array<Extract<CommunicationChatListRow, { kind: "email" }>>;
  groups: CommunicationChatListStatusGroup[];
} {
  const drafts: Array<Extract<CommunicationChatListRow, { kind: "email" }>> =
    [];
  const nextGroups: CommunicationChatListStatusGroup[] = [];
  for (const group of groups) {
    const rows: CommunicationChatListRow[] = [];
    for (const row of group.rows) {
      if (row.kind === "email" && isCommunicationEmailDraft(row.item)) {
        drafts.push(row);
        continue;
      }
      rows.push(row);
    }
    if (rows.length > 0) {
      nextGroups.push({ ...group, rows });
    }
  }
  drafts.sort(
    (left, right) =>
      communicationChatListRowActivityMs(right) -
      communicationChatListRowActivityMs(left),
  );
  return { drafts, groups: nextGroups };
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
  item: Pick<
    InboxEmailListItem,
    "partyLabel" | "contactName" | "organizationName"
  >,
): string {
  const linkedContact = item.contactName?.trim();
  if (linkedContact) return linkedContact;
  const linkedOrg = item.organizationName?.trim();
  if (linkedOrg) return linkedOrg;
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

/** Top-line party label for support cards (contact → org → project → Support). */
export function supportListItemPartyName(
  item: Pick<
    InboxTaskListItem,
    "contactName" | "organizationName" | "projectName" | "projectKey" | "title"
  >,
): string {
  return (
    item.contactName?.trim() ||
    item.organizationName?.trim() ||
    item.projectName?.trim() ||
    item.projectKey?.trim() ||
    item.title?.trim() ||
    "Support"
  );
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

function supportActivityMs(item: InboxTaskListItem): number {
  const ms = item.updatedAt;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
}

export function communicationChatListRowActivityMs(
  row: CommunicationChatListRow,
): number {
  if (row.kind === "chat") return chatActivityMs(row.conversation);
  if (row.kind === "email") return emailActivityMs(row.item);
  return supportActivityMs(row.item);
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
 * Build a Triage / Waiting / In Review / On Hold / Completed list with chats,
 * emails, and support tickets interleaved by last activity within each group.
 */
export function groupCommunicationChatListRows(
  conversations: readonly ChatConversation[],
  emails: readonly InboxEmailListItem[],
  supportTasks: readonly InboxTaskListItem[] = [],
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
  for (const item of supportTasks) {
    const row: CommunicationChatListRow = { kind: "support", item };
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
function communicationChatListRowId(row: CommunicationChatListRow): string {
  return row.kind === "chat" ? row.conversation.id : row.item.id;
}

export function communicationChatListRowIds(
  groups: readonly CommunicationChatListStatusGroup[],
): string[] {
  return groups.flatMap((group) => group.rows.map(communicationChatListRowId));
}

/** Row ids in on-screen order: peeled drafts first, then the status groups. */
export function communicationChatListVisibleRowIds(peeled: {
  drafts: readonly CommunicationChatListRow[];
  groups: readonly CommunicationChatListStatusGroup[];
}): string[] {
  return [
    ...peeled.drafts.map(communicationChatListRowId),
    ...communicationChatListRowIds(peeled.groups),
  ];
}

/**
 * Flat j/k order matching the unified Messages list.
 * Skips collapsed status groups so keyboard nav cannot land on hidden rows.
 */
export function communicationChatListKeyboardItemIds(
  peeled: {
    drafts: readonly CommunicationChatListRow[];
    groups: readonly CommunicationChatListStatusGroup[];
  },
  collapsedKeys: ReadonlySet<string> = new Set(),
): string[] {
  return [
    ...peeled.drafts.map(communicationChatListRowId),
    ...peeled.groups.flatMap((group) =>
      collapsedKeys.has(group.status)
        ? []
        : group.rows.map(communicationChatListRowId),
    ),
  ];
}

function haystackIncludes(needle: string, ...values: Array<string | null | undefined>): boolean {
  return values.some((value) => (value ?? "").toLowerCase().includes(needle));
}

/** Whether a unified list row matches a free-text search query. */
export function communicationChatListRowMatchesQuery(
  row: CommunicationChatListRow,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (row.kind === "chat") {
    const conversation = row.conversation;
    return haystackIncludes(
      needle,
      conversation.contactName,
      conversation.contactEmail,
      conversation.contactPhone,
      conversation.lastMessagePreview,
      conversation.inboxName,
    );
  }
  if (row.kind === "support") {
    const item = row.item;
    return haystackIncludes(
      needle,
      item.title,
      item.contactName,
      item.organizationName,
      item.projectName,
      item.projectKey,
      supportListItemPartyName(item),
    );
  }
  const item = row.item;
  return haystackIncludes(
    needle,
    item.title,
    item.partyLabel,
    item.contactName,
    item.organizationName,
    emailListItemPartyName(item),
    emailListItemPartyEmail(item),
  );
}

/** Drop rows that do not match `query`; omit empty status groups. */
export function filterCommunicationChatListGroups(
  groups: readonly CommunicationChatListStatusGroup[],
  query: string,
): CommunicationChatListStatusGroup[] {
  const needle = query.trim();
  if (!needle) return [...groups];
  return groups.flatMap((group) => {
    const rows = group.rows.filter((row) =>
      communicationChatListRowMatchesQuery(row, needle),
    );
    if (rows.length === 0) return [];
    return [{ ...group, rows }];
  });
}
