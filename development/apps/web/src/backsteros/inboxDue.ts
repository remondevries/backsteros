import { formatDueDateInputValue, formatLocalYmd } from "./taskDueDate";
import { migrateBacksterosTaskStatus } from "./taskStatus";

const INACTIVE_STATUSES = new Set(["completed", "canceled", "duplicated"]);
const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

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
  input: {
    readonly dueDate?: string | null | undefined;
    readonly status?: string | null | undefined;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (isBacksterosInactiveTaskStatus(input.status)) return false;
  const dueYmd = formatDueDateInputValue(input.dueDate);
  if (!dueYmd) return false;
  return dueYmd <= formatLocalYmd(referenceDate);
}

/**
 * Inbox membership: attention statuses, due today/overdue, or a live agent
 * working stretch (pulse icon) — working always wins so active agents stay
 * visible regardless of due date / other properties.
 */
export function isBacksterosInboxMemberTask(
  input: {
    readonly id: string;
    readonly dueDate?: string | null | undefined;
    readonly status?: string | null | undefined;
  },
  options?: {
    readonly workingTaskIds?: ReadonlySet<string>;
    readonly referenceDate?: Date;
  },
): boolean {
  if (options?.workingTaskIds?.has(input.id)) return true;
  if (isBacksterosInboxAttentionStatus(input.status)) return true;
  return isBacksterosInboxDueTask(input, options?.referenceDate);
}

/**
 * Soft-poll inbox rows plus any live working tasks not already in that set.
 * Working extras append after API order; callers regroup via partition.
 */
export function mergeBacksterosInboxTasksWithWorking<T extends { readonly id: string }>(input: {
  readonly inboxTasks: readonly T[];
  readonly workingTasksById: ReadonlyMap<string, T>;
  readonly workingTaskIds: ReadonlySet<string>;
}): readonly T[] {
  if (input.workingTaskIds.size === 0) return input.inboxTasks;
  const present = new Set(input.inboxTasks.map((task) => task.id));
  const extras: T[] = [];
  for (const taskId of input.workingTaskIds) {
    if (present.has(taskId)) continue;
    const task = input.workingTasksById.get(taskId);
    if (task) extras.push(task);
  }
  return extras.length === 0 ? input.inboxTasks : [...input.inboxTasks, ...extras];
}

export type BacksterosInboxPartition<
  T extends {
    readonly id: string;
    readonly status: string;
    readonly dueDate?: string | null | undefined;
  },
> = {
  readonly attentionTasks: readonly T[];
  readonly dueTasks: readonly T[];
};

/**
 * Status groups first: attention-status tasks stay in status buckets even when
 * due. Live agent-working tasks join attention even when status/due would
 * otherwise exclude them. Due group only gets open due-today/overdue tasks
 * that are not already covered.
 */
export function partitionBacksterosInboxTasks<
  T extends {
    readonly id: string;
    readonly status: string;
    readonly dueDate?: string | null | undefined;
    readonly sortOrder?: number;
    readonly title?: string;
  },
>(
  tasks: readonly T[],
  referenceDate: Date = new Date(),
  workingTaskIds: ReadonlySet<string> = EMPTY_WORKING_TASK_IDS,
): BacksterosInboxPartition<T> {
  const dueTasks: T[] = [];
  const attentionTasks: T[] = [];

  for (const task of tasks) {
    if (isBacksterosInboxAttentionStatus(task.status) || workingTaskIds.has(task.id)) {
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
