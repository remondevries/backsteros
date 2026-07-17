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

/** Display order for lists and grouping. */
export const TASK_STATUS_ORDER: TaskStatus[] = [...TASK_STATUSES];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function isTriageStatus(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  return migrateLegacyTaskStatus(status) === "triage";
}

/** Map legacy DB values from the first schema version. */
export function migrateLegacyTaskStatus(status: string): TaskStatus {
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
