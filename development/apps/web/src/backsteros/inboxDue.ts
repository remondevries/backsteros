import { formatDueDateInputValue, formatLocalYmd } from "./taskDueDate";
import { migrateBacksterosTaskStatus } from "./taskStatus";

const INACTIVE_STATUSES = new Set(["completed", "canceled", "duplicated"]);

/** Statuses that keep their own inbox groups (Due never steals these). */
export const BACKSTEROS_INBOX_ATTENTION_STATUSES = [
  "triage",
  "in_review",
  "in_progress",
  "on_hold",
] as const;

const ATTENTION_STATUS_SET = new Set<string>(BACKSTEROS_INBOX_ATTENTION_STATUSES);

export function isBacksterosInactiveTaskStatus(status: string | null | undefined): boolean {
  return INACTIVE_STATUSES.has(migrateBacksterosTaskStatus(status ?? "backlog"));
}

export function isBacksterosInboxAttentionStatus(status: string | null | undefined): boolean {
  return ATTENTION_STATUS_SET.has(migrateBacksterosTaskStatus(status ?? "backlog"));
}

/**
 * Open tasks due today or earlier (local calendar day).
 * Used for inbox membership of non-attention statuses (Due group).
 */
export function isBacksterosInboxDueTask(
  input: { readonly dueDate?: string | null; readonly status?: string | null },
  referenceDate: Date = new Date(),
): boolean {
  if (isBacksterosInactiveTaskStatus(input.status)) return false;
  const dueYmd = formatDueDateInputValue(input.dueDate);
  if (!dueYmd) return false;
  return dueYmd <= formatLocalYmd(referenceDate);
}

export type BacksterosInboxPartition<
  T extends {
    readonly id: string;
    readonly status: string;
    readonly dueDate?: string | null;
  },
> = {
  readonly attentionTasks: readonly T[];
  readonly dueTasks: readonly T[];
};

/**
 * Status groups first: attention-status tasks stay in status buckets even when
 * due. Due group only gets open due-today/overdue tasks that are not already
 * covered by those statuses.
 */
export function partitionBacksterosInboxTasks<
  T extends {
    readonly id: string;
    readonly status: string;
    readonly dueDate?: string | null;
    readonly sortOrder?: number;
    readonly title?: string;
  },
>(tasks: readonly T[], referenceDate: Date = new Date()): BacksterosInboxPartition<T> {
  const dueTasks: T[] = [];
  const attentionTasks: T[] = [];

  for (const task of tasks) {
    if (isBacksterosInboxAttentionStatus(task.status)) {
      attentionTasks.push(task);
      continue;
    }
    if (isBacksterosInboxDueTask(task, referenceDate)) {
      dueTasks.push(task);
    }
  }

  dueTasks.sort((left, right) => {
    const byDue = formatDueDateInputValue(left.dueDate).localeCompare(
      formatDueDateInputValue(right.dueDate),
    );
    if (byDue !== 0) return byDue;
    const byOrder = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (byOrder !== 0) return byOrder;
    return (left.title ?? "").localeCompare(right.title ?? "", undefined, {
      sensitivity: "base",
    });
  });

  return { attentionTasks, dueTasks };
}

/** End of local today — safe `before` bound for `GET /api/v1/tasks/due`. */
export function backsterosInboxDueBeforeIso(referenceDate: Date = new Date()): string {
  const endOfToday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    23,
    59,
    59,
    999,
  );
  return endOfToday.toISOString();
}
