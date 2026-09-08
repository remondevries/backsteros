/** Mirrors `@backsteros/ui` inbox attention grouping for mobile lists. */

import { inboxUpdatedAtRequiresInboxListing } from "@backsteros/contracts";

import {
  getTaskDueDateYmd,
  formatLocalYmd,
} from "./task-due-date";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status";

export const INBOX_ATTENTION_STATUS_ORDER = [
  "updated",
  "agents",
  "overdue",
  "triage",
  "on_hold",
  "in_review",
] as const;

export type InboxAttentionStatus =
  (typeof INBOX_ATTENTION_STATUS_ORDER)[number];

export const INBOX_ATTENTION_REAL_STATUSES = [
  "on_hold",
  "in_review",
] as const satisfies readonly TaskStatus[];

const INACTIVE_TASK_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

function isInactiveTaskStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return INACTIVE_TASK_STATUSES.has(migrateLegacyTaskStatus(status));
}

function hasTimestamp(value: unknown): boolean {
  return value != null && value !== "";
}

export function isAgentInboxPending(input: {
  agent_created_at?: string | null;
  agentCreatedAt?: string | number | null;
  agent_inbox_approved_at?: string | null;
  agentInboxApprovedAt?: string | number | null;
}): boolean {
  const created =
    input.agent_created_at ?? input.agentCreatedAt ?? null;
  if (!hasTimestamp(created)) return false;
  const approved =
    input.agent_inbox_approved_at ?? input.agentInboxApprovedAt ?? null;
  return !hasTimestamp(approved);
}

export function isInboxOverdueTask(
  input: {
    due_date?: string | null;
    dueDate?: string | number | Date | null;
    status?: string | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (isInactiveTaskStatus(input.status)) return false;
  const dueYmd = getTaskDueDateYmd(input.due_date ?? input.dueDate ?? null);
  if (!dueYmd) return false;
  return dueYmd < formatLocalYmd(referenceDate);
}

/**
 * Whether a task belongs in the expanded inbox — same rules as desktop
 * `@backsteros/ui` `taskBelongsInInbox`:
 * - classic triage capture (`inbox` / status triage)
 * - On Hold / In Review from any project
 * - overdue open tasks
 * - agent-created tasks pending sign-off
 * - external `inboxUpdatedAt` updates
 *
 * Habit day instances stay on Journal / Habits — never in the Inbox list.
 * Tasks due today or later wait until they are overdue (past due).
 */
export function taskBelongsInInbox(
  input: {
    inbox?: boolean | number | null;
    status?: string | null;
    due_date?: string | null;
    dueDate?: string | number | Date | null;
    agent_created_at?: string | null;
    agentCreatedAt?: string | number | null;
    agent_inbox_approved_at?: string | null;
    agentInboxApprovedAt?: string | number | null;
    inbox_updated_at?: string | null;
    inboxUpdatedAt?: string | number | Date | null;
    habit_id?: string | null;
    habitId?: string | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  const habitId = input.habit_id ?? input.habitId;
  if (habitId != null && String(habitId).trim() !== "") {
    return false;
  }
  const dueYmd = getTaskDueDateYmd(input.due_date ?? input.dueDate ?? null);
  if (dueYmd && dueYmd >= formatLocalYmd(referenceDate)) {
    return false;
  }
  if (
    inboxUpdatedAtRequiresInboxListing(
      input.inbox_updated_at ?? input.inboxUpdatedAt ?? null,
    )
  ) {
    return true;
  }
  if (isAgentInboxPending(input)) return true;
  if (input.inbox === true || input.inbox === 1) return true;
  const status = migrateLegacyTaskStatus(input.status);
  // Triage capture — same as attention grouping / inbox SQL.
  if (status === "triage") return true;
  if (
    (INBOX_ATTENTION_REAL_STATUSES as readonly string[]).includes(status)
  ) {
    return true;
  }
  return isInboxOverdueTask(input, referenceDate);
}

export function getInboxAttentionGroupKey(
  input: {
    inbox?: boolean | number | null;
    status?: string | null;
    due_date?: string | null;
    dueDate?: string | number | Date | null;
    agent_created_at?: string | null;
    agentCreatedAt?: string | number | null;
    agent_inbox_approved_at?: string | null;
    agentInboxApprovedAt?: string | number | null;
    inbox_updated_at?: string | null;
    inboxUpdatedAt?: string | number | Date | null;
  },
  referenceDate: Date = new Date(),
): InboxAttentionStatus | "other" {
  if (
    inboxUpdatedAtRequiresInboxListing(
      input.inbox_updated_at ?? input.inboxUpdatedAt ?? null,
    )
  ) {
    return "updated";
  }
  if (isAgentInboxPending(input)) return "agents";
  if (isInboxOverdueTask(input, referenceDate)) return "overdue";
  const status = migrateLegacyTaskStatus(input.status);
  if (input.inbox === true || input.inbox === 1 || status === "triage") {
    return "triage";
  }
  if (status === "on_hold") return "on_hold";
  if (status === "in_review") return "in_review";
  return "other";
}

export function getInboxAttentionGroupLabel(status: string): string {
  if (status === "updated") return "Updated";
  if (status === "agents") return "Agents";
  if (status === "overdue") return "Overdue";
  return getTaskStatusLabel(status);
}

export type InboxAttentionGroup<T> = {
  status: string;
  label: string;
  data: T[];
};

export function groupInboxRowsByAttentionStatus<
  T extends {
    inbox?: boolean | number | null;
    status?: string | null;
    due_date?: string | null;
    agent_created_at?: string | null;
    agentCreatedAt?: string | number | null;
    agent_inbox_approved_at?: string | null;
    agentInboxApprovedAt?: string | number | null;
    inbox_updated_at?: string | null;
    inboxUpdatedAt?: string | number | Date | null;
  },
>(rows: readonly T[], referenceDate: Date = new Date()): InboxAttentionGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const status of INBOX_ATTENTION_STATUS_ORDER) {
    buckets.set(status, []);
  }
  const other: T[] = [];

  for (const row of rows) {
    const key = getInboxAttentionGroupKey(row, referenceDate);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else other.push(row);
  }

  const groups: InboxAttentionGroup<T>[] = [];
  for (const status of INBOX_ATTENTION_STATUS_ORDER) {
    const data = buckets.get(status) ?? [];
    if (data.length === 0) continue;
    groups.push({
      status,
      label: getInboxAttentionGroupLabel(status),
      data,
    });
  }
  if (other.length > 0) {
    groups.push({ status: "other", label: "Other", data: other });
  }
  return groups;
}

/**
 * After dismissing an inbox row (e.g. agent Approve), pick the neighbor to open:
 * prefer the item above, else the next item, else null (empty inbox).
 */
export function pickIdAfterRemoving(
  orderedIds: readonly string[],
  removedId: string,
): string | null {
  const index = orderedIds.indexOf(removedId);
  if (index === -1) {
    return orderedIds.find((id) => id !== removedId) ?? null;
  }
  if (index > 0) {
    return orderedIds[index - 1] ?? null;
  }
  if (index + 1 < orderedIds.length) {
    return orderedIds[index + 1] ?? null;
  }
  return null;
}

/** Flat visual order matching attention-grouped inbox sections. */
export function flattenInboxAttentionOrder<
  T extends {
    id: string;
    inbox?: boolean | number | null;
    status?: string | null;
    due_date?: string | null;
    agent_created_at?: string | null;
    agentCreatedAt?: string | number | null;
    agent_inbox_approved_at?: string | null;
    agentInboxApprovedAt?: string | number | null;
    inbox_updated_at?: string | null;
    inboxUpdatedAt?: string | number | Date | null;
  },
>(rows: readonly T[], referenceDate: Date = new Date()): T[] {
  return groupInboxRowsByAttentionStatus(rows, referenceDate).flatMap(
    (group) => group.data,
  );
}
