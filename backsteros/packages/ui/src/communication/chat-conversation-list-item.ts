import type { ChatConversation } from "@backsteros/contracts";

import type { TaskItemRowTask } from "../components/tasks/task-item-row.js";
import type { TaskStatus } from "../tasks/task-status.js";

const CHAT_STATUS_ORDER = [
  "open",
  "pending",
  "snoozed",
  "resolved",
] as const satisfies readonly ChatConversation["status"][];

export type ChatListStatus = (typeof CHAT_STATUS_ORDER)[number];

export const CHAT_LIST_STATUS_ORDER: readonly ChatListStatus[] = CHAT_STATUS_ORDER;

export function getChatListStatusLabel(status: ChatListStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "pending":
      return "Pending";
    case "snoozed":
      return "Snoozed";
    case "resolved":
      return "Resolved";
    default:
      return status;
  }
}

/** Map Chatwoot conversation status → task status icon / row chrome. */
export function chatStatusToTaskStatus(
  status: ChatConversation["status"],
): TaskStatus {
  switch (status) {
    case "resolved":
      return "completed";
    case "pending":
      return "waiting";
    case "snoozed":
      return "backlog";
    case "open":
    default:
      return "triage";
  }
}

/** Map a task-status dropdown change back to a chat conversation status. */
export function taskStatusToChatStatus(
  status: TaskStatus,
): ChatConversation["status"] {
  switch (status) {
    case "completed":
    case "canceled":
    case "duplicated":
      return "resolved";
    case "waiting":
    case "on_hold":
      return "pending";
    case "backlog":
      return "snoozed";
    default:
      return "open";
  }
}

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
    contactId: null,
    assigneeId: row.assigneeId ?? null,
    support: true,
    updatedAt: updatedAt ?? undefined,
    inboxUpdatedAt: updatedAt,
    listKind: "task",
  };
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
