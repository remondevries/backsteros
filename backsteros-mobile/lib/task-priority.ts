export const TASK_PRIORITY_LABELS = [
  "No priority",
  "Urgent",
  "High",
  "Medium",
  "Low",
] as const;

export function getTaskPriorityLabel(priority?: number | null): string {
  if (priority == null || priority < 0 || priority > 4) {
    return TASK_PRIORITY_LABELS[0];
  }
  return TASK_PRIORITY_LABELS[priority] ?? TASK_PRIORITY_LABELS[0];
}

export function getTaskPriorityActiveBars(priority?: number | null): number {
  if (priority == null || priority === 0) return 0;
  if (priority === 4) return 1;
  if (priority === 3) return 2;
  return 3;
}

export function isTaskPriorityUrgent(priority?: number | null): boolean {
  return priority === 1;
}

export function isTaskPriorityNone(priority?: number | null): boolean {
  return priority == null || priority === 0;
}
