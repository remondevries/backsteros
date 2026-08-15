/** Mirrors `@backsteros/ui` inbox attention grouping for mobile lists. */

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

export function taskBelongsInInbox(
  input: {
    inbox?: boolean | number | null;
    status?: string | null;
    due_date?: string | null;
    dueDate?: string | number | Date | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (input.inbox === true || input.inbox === 1) return true;
  const status = migrateLegacyTaskStatus(input.status);
  if (
    (INBOX_ATTENTION_REAL_STATUSES as readonly string[]).includes(status)
  ) {
    const dueYmd = getTaskDueDateYmd(input.due_date ?? input.dueDate ?? null);
    if (dueYmd && dueYmd > formatLocalYmd(referenceDate)) {
      return false;
    }
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
  },
  referenceDate: Date = new Date(),
): InboxAttentionStatus | "other" {
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
