export const INBOX_TASK_KEY = "IN";

export function formatTaskDisplayId(
  projectKey: string,
  taskNumber: number,
): string {
  return `${projectKey}-${taskNumber}`;
}

export type TaskDisplayIdSource = {
  number: number | null | undefined;
  projectId?: string | null;
  contactId?: string | null;
};

export function getTaskDisplayId(
  task: TaskDisplayIdSource,
  contextKey?: string | null,
): string | null {
  if (!task.number) {
    return null;
  }

  if (contextKey) {
    return formatTaskDisplayId(contextKey, task.number);
  }

  if (task.contactId) {
    return null;
  }

  const key = task.projectId ? null : INBOX_TASK_KEY;
  if (!key) {
    return null;
  }

  return formatTaskDisplayId(key, task.number);
}
