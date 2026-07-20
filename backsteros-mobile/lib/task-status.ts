/** Mirrors `@backsteros/ui` task status order / labels for mobile lists. */

export const TASK_STATUSES = [
  "triage",
  "backlog",
  "ready_to_start",
  "in_progress",
  "on_hold",
  "in_review",
  "completed",
  "canceled",
  "duplicated",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  triage: "Triage",
  backlog: "Backlog",
  ready_to_start: "Ready to Start",
  in_progress: "In Progress",
  on_hold: "On Hold",
  in_review: "In Review",
  completed: "Completed",
  canceled: "Canceled",
  duplicated: "Duplicated",
};

export const TASK_STATUS_ORDER: TaskStatus[] = [...TASK_STATUSES];

/**
 * Desktop/Next dark-scheme status colors
 * (`task-status-color.ts` DEFAULT_STATUS_HEX + dark-adapted neutrals).
 */
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  triage: "#ee7a47",
  backlog: "#c4c4c8",
  ready_to_start: "#e8e8e8",
  in_progress: "#e9c141",
  on_hold: "#da615d",
  in_review: "#52a450",
  completed: "#606acc",
  canceled: "#e8e8e8",
  duplicated: "#a8b0c0",
};

export function migrateLegacyTaskStatus(status: string | null | undefined): TaskStatus {
  switch (status) {
    case "todo":
      return "ready_to_start";
    case "done":
      return "completed";
    case "triage":
    case "backlog":
    case "ready_to_start":
    case "in_progress":
    case "on_hold":
    case "in_review":
    case "completed":
    case "canceled":
    case "duplicated":
      return status;
    default:
      return "backlog";
  }
}

export function getTaskStatusLabel(status: string | null | undefined): string {
  return TASK_STATUS_LABELS[migrateLegacyTaskStatus(status)];
}

export type TaskLikeForGrouping = {
  status: string | null;
  sort_order?: number | null;
  sortOrder?: number | null;
};

export type TaskStatusGroup<T extends TaskLikeForGrouping> = {
  status: TaskStatus;
  label: string;
  tasks: T[];
};

export function groupTasksByStatus<T extends TaskLikeForGrouping>(
  tasks: readonly T[],
): TaskStatusGroup<T>[] {
  const buckets = new Map<TaskStatus, T[]>();
  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const task of tasks) {
    const status = migrateLegacyTaskStatus(task.status);
    buckets.get(status)?.push(task);
  }

  return TASK_STATUS_ORDER.map((status) => ({
    status,
    label: TASK_STATUS_LABELS[status],
    tasks: (buckets.get(status) ?? []).sort((left, right) => {
      const a = left.sort_order ?? left.sortOrder ?? 0;
      const b = right.sort_order ?? right.sortOrder ?? 0;
      return a - b;
    }),
  })).filter((group) => group.tasks.length > 0);
}
