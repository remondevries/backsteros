export const BACKSTEROS_TASK_STATUSES = [
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

export type BacksterosTaskStatus = (typeof BACKSTEROS_TASK_STATUSES)[number];

export const BACKSTEROS_TASK_STATUS_LABELS: Record<BacksterosTaskStatus, string> = {
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

export const BACKSTEROS_TASK_STATUS_ORDER: readonly BacksterosTaskStatus[] = [
  "triage",
  "in_review",
  "in_progress",
  "on_hold",
  "backlog",
  "ready_to_start",
  "completed",
  "canceled",
  "duplicated",
];

export function isBacksterosTaskStatus(value: string): value is BacksterosTaskStatus {
  return (BACKSTEROS_TASK_STATUSES as readonly string[]).includes(value);
}

export function getBacksterosTaskStatusLabel(status: BacksterosTaskStatus): string {
  return BACKSTEROS_TASK_STATUS_LABELS[status];
}

export function migrateBacksterosTaskStatus(status: string): BacksterosTaskStatus {
  switch (status) {
    case "todo":
      return "ready_to_start";
    case "done":
      return "completed";
    default:
      return isBacksterosTaskStatus(status) ? status : "backlog";
  }
}

export type BacksterosTaskLikeForGrouping = {
  readonly status: string;
  readonly sortOrder?: number;
  readonly dueDate?: string | null;
  readonly title?: string;
};

export type BacksterosTaskStatusGroup<T extends BacksterosTaskLikeForGrouping> = {
  readonly status: BacksterosTaskStatus;
  readonly label: string;
  readonly tasks: readonly T[];
};

const DUE_DATE_SORT_STATUSES = new Set<BacksterosTaskStatus>([
  "completed",
  "in_review",
  "canceled",
  "duplicated",
]);

function compareTasksInStatusGroup<T extends BacksterosTaskLikeForGrouping>(
  status: BacksterosTaskStatus,
  left: T,
  right: T,
): number {
  if (DUE_DATE_SORT_STATUSES.has(status)) {
    const leftDue = left.dueDate ?? "";
    const rightDue = right.dueDate ?? "";
    if (leftDue && rightDue) {
      const byDue = rightDue.localeCompare(leftDue);
      if (byDue !== 0) return byDue;
    } else if (leftDue) {
      return -1;
    } else if (rightDue) {
      return 1;
    }
  }

  const orderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return (left.title ?? "").localeCompare(right.title ?? "", undefined, {
    sensitivity: "base",
  });
}

/** Mirrors BacksterOS desktop `groupTasksByStatus`. */
export function groupBacksterosTasksByStatus<T extends BacksterosTaskLikeForGrouping>(
  tasks: readonly T[],
): BacksterosTaskStatusGroup<T>[] {
  const buckets = new Map<BacksterosTaskStatus, T[]>();
  for (const status of BACKSTEROS_TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const task of tasks) {
    const status = migrateBacksterosTaskStatus(task.status);
    buckets.get(status)?.push(task);
  }

  return BACKSTEROS_TASK_STATUS_ORDER.flatMap((status) => {
    const groupTasks = [...(buckets.get(status) ?? [])].sort((left, right) =>
      compareTasksInStatusGroup(status, left, right),
    );
    if (groupTasks.length === 0) return [];
    return [
      {
        status,
        label: getBacksterosTaskStatusLabel(status),
        tasks: groupTasks,
      },
    ];
  });
}
