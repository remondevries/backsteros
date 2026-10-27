import { formatDueDateInputValue, formatLocalYmd } from "./taskDueDate";
import { migrateBacksterosTaskStatus } from "./taskStatus";

const INACTIVE_STATUSES = new Set(["completed", "canceled", "duplicated"]);

/** Statuses always shown in the inbox (their own status groups). */
export const BACKSTEROS_INBOX_ATTENTION_STATUSES = [
  "triage",
  "in_review",
  "in_progress",
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
 * Used for inbox membership of non-attention statuses (shown under their
 * own status group — Backlog, Ready to Start, etc.).
 * Waiting stays project-only: follow-ups live under project Tasks, not Inbox.
 */
export function isBacksterosInboxDueTask(
  input: {
    readonly dueDate?: string | null | undefined;
    readonly status?: string | null | undefined;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (isBacksterosInactiveTaskStatus(input.status)) return false;
  if (migrateBacksterosTaskStatus(input.status ?? "backlog") === "waiting") return false;
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
 * Working extras append after API order; callers regroup by status.
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
