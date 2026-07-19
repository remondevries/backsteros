export const TASK_PRIORITY_LABELS = [
  "No priority",
  "Urgent",
  "High",
  "Medium",
  "Low",
] as const;

export type TaskPriority = 0 | 1 | 2 | 3 | 4;

export const TASK_PRIORITY_ORDER: TaskPriority[] = [0, 1, 2, 3, 4];

export type TaskPriorityDropdownValue = `${TaskPriority}`;

export function isTaskPriority(value: number): value is TaskPriority {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

export function toTaskPriorityDropdownValue(
  priority: number | undefined,
): TaskPriorityDropdownValue {
  if (priority === undefined || !isTaskPriority(priority)) {
    return "0";
  }
  return String(priority) as TaskPriorityDropdownValue;
}

export function fromTaskPriorityDropdownValue(
  value: TaskPriorityDropdownValue,
): TaskPriority {
  const parsed = Number(value);
  return isTaskPriority(parsed) ? parsed : 0;
}

export function getTaskPriorityLabel(priority?: number): string {
  if (priority === undefined || priority < 0 || priority > 4) {
    return TASK_PRIORITY_LABELS[0];
  }
  return TASK_PRIORITY_LABELS[priority] ?? TASK_PRIORITY_LABELS[0];
}

export function getTaskPriorityActiveBars(priority?: number): number {
  if (priority === undefined || priority === 0) return 0;
  if (priority === 4) return 1;
  if (priority === 3) return 2;
  return 3;
}

export function isTaskPriorityUrgent(priority?: number): boolean {
  return priority === 1;
}

export function isTaskPriorityNone(priority?: number): boolean {
  return priority === undefined || priority === 0;
}
