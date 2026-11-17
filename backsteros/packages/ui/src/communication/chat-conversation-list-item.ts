import type { ChatConversation } from "@backsteros/contracts";

import type { TaskItemRowTask } from "../components/tasks/task-item-row.js";
import {
  buildInboxTaskListItem,
  type InboxTaskListItem,
} from "../inbox/inbox-items.js";
import type { TaskStatus } from "../tasks/task-status.js";

/** Chatwoot conversation statuses (API / storage). */
const CHATWOOT_STATUS_ORDER = [
  "open",
  "pending",
  "snoozed",
  "resolved",
] as const satisfies readonly ChatConversation["status"][];

/**
 * Mixed chat+email list groups. Chatwoot still uses open / pending / snoozed /
 * resolved; email/support rows also get In Progress / Ready to Start / Backlog /
 * In Review (chats never land in those buckets).
 *
 * Early pipeline: Triage → In Progress → Ready to Start → Backlog, then
 * Waiting / In Review / On Hold / Completed.
 */
export const CHAT_LIST_STATUS_ORDER = [
  "open",
  "in_progress",
  "ready_to_start",
  "backlog",
  "pending",
  "in_review",
  "snoozed",
  "resolved",
] as const;

export type ChatListStatus = (typeof CHAT_LIST_STATUS_ORDER)[number];

/**
 * BacksterOS labels for the mixed chat+email list. Chatwoot still stores
 * open / pending / snoozed / resolved; we relabel those groups and add
 * In Progress / Ready to Start / Backlog / In Review for email/support.
 */
export function getChatListStatusLabel(status: ChatListStatus): string {
  switch (status) {
    case "open":
      return "Triage";
    case "in_progress":
      return "In Progress";
    case "ready_to_start":
      return "Ready to Start";
    case "backlog":
      return "Backlog";
    case "pending":
      return "Waiting";
    case "in_review":
      return "In Review";
    case "snoozed":
      return "On Hold";
    case "resolved":
      return "Completed";
    default:
      return status;
  }
}

/**
 * Map a mixed-list / Chatwoot status → BacksterOS task status (icons / chrome).
 * Accepts {@link ChatListStatus} so group headers get the right icon.
 */
export function chatStatusToTaskStatus(status: ChatListStatus): TaskStatus {
  switch (status) {
    case "resolved":
      return "completed";
    case "pending":
      return "waiting";
    case "in_review":
      return "in_review";
    case "snoozed":
      return "on_hold";
    case "backlog":
      return "backlog";
    case "ready_to_start":
      return "ready_to_start";
    case "in_progress":
      return "in_progress";
    case "open":
    default:
      return "triage";
  }
}

/**
 * Map a BacksterOS task status onto mixed-list groups.
 * Shared with email rows so triage / in progress / ready to start / backlog /
 * waiting / in review / on hold / completed land in distinct sections (chats
 * still use open / pending / snoozed / resolved).
 */
export function taskStatusToChatStatus(status: TaskStatus): ChatListStatus {
  switch (status) {
    case "completed":
    case "canceled":
    case "duplicated":
      return "resolved";
    case "waiting":
      return "pending";
    case "in_review":
      return "in_review";
    case "on_hold":
      return "snoozed";
    case "backlog":
      return "backlog";
    case "ready_to_start":
      return "ready_to_start";
    case "in_progress":
      return "in_progress";
    default:
      // triage → Triage group (Chatwoot `open`)
      return "open";
  }
}

/**
 * Fold mixed-list statuses into Chatwoot conversation statuses for API writes.
 * Email-only buckets (In Progress / Ready to Start / Backlog / In Review) map
 * onto the nearest Chatwoot status so chats never receive an invalid value.
 */
export function chatListStatusToChatwootStatus(
  status: ChatListStatus,
): ChatConversation["status"] {
  switch (status) {
    case "pending":
    case "in_review":
      return "pending";
    case "snoozed":
    case "backlog":
      return "snoozed";
    case "resolved":
      return "resolved";
    case "open":
    case "in_progress":
    case "ready_to_start":
    default:
      return "open";
  }
}

/** Chatwoot-only statuses (no In Review). */
export const CHATWOOT_LIST_STATUS_ORDER: readonly ChatConversation["status"][] =
  CHATWOOT_STATUS_ORDER;

function conversationTitle(row: ChatConversation): string {
  return (
    row.contactName?.trim() ||
    row.contactEmail?.trim() ||
    row.contactPhone?.trim() ||
    `Chat ${row.externalId}`
  );
}

function conversationNumber(row: ChatConversation): number {
  const parsed = Number.parseInt(row.externalId, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  let hash = 0;
  for (const char of row.id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 100_000 || 1;
}

function activityEpoch(row: ChatConversation): number | null {
  const raw = row.lastActivityAt ?? row.updatedAt;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Shape a Chatwoot conversation as an inbox/task list row. */
export function chatConversationToTaskItemRowTask(
  row: ChatConversation,
): TaskItemRowTask {
  const updatedAt = activityEpoch(row);
  const dueMs = row.dueDate ? new Date(row.dueDate).getTime() : null;
  return {
    id: row.id,
    number: conversationNumber(row),
    title: conversationTitle(row),
    status: chatStatusToTaskStatus(row.status),
    priority: row.priority ?? 0,
    dueDate: dueMs != null && Number.isFinite(dueMs) ? dueMs : null,
    projectId: null,
    projectKey: "CH",
    projectName: row.inboxName?.trim() || null,
    contactId: row.contactId ?? null,
    assigneeId: row.assigneeId ?? null,
    support: true,
    updatedAt: updatedAt ?? undefined,
    inboxUpdatedAt: updatedAt,
    listKind: "task",
  };
}

/** Shape a Chatwoot conversation as an Inbox → Messages list row. */
export function chatConversationToInboxListItem(
  row: ChatConversation,
): InboxTaskListItem {
  const updatedAt = activityEpoch(row);
  const dueMs = row.dueDate ? new Date(row.dueDate).getTime() : null;
  return buildInboxTaskListItem({
    id: row.id,
    title: conversationTitle(row),
    number: conversationNumber(row),
    status: chatStatusToTaskStatus(row.status),
    priority: row.priority ?? 0,
    dueDate: dueMs != null && Number.isFinite(dueMs) ? dueMs : null,
    updatedAt: updatedAt ?? Date.now(),
    projectKey: "CH",
    projectName: row.inboxName?.trim() || null,
    contactId: row.contactId ?? null,
    assigneeId: row.assigneeId ?? null,
    inboxUpdatedAt: updatedAt,
    chat: true,
  });
}

export function groupChatConversationsByStatus(
  conversations: readonly ChatConversation[],
): {
  status: ChatListStatus;
  label: string;
  conversations: ChatConversation[];
}[] {
  const buckets = new Map<ChatListStatus, ChatConversation[]>(
    CHAT_LIST_STATUS_ORDER.map((status) => [status, []]),
  );
  for (const row of conversations) {
    const status = (
      CHAT_LIST_STATUS_ORDER.includes(row.status as ChatListStatus)
        ? row.status
        : "open"
    ) as ChatListStatus;
    buckets.get(status)!.push(row);
  }
  return CHAT_LIST_STATUS_ORDER.flatMap((status) => {
    const group = buckets.get(status) ?? [];
    if (group.length === 0) return [];
    return [
      {
        status,
        label: getChatListStatusLabel(status),
        conversations: group,
      },
    ];
  });
}
