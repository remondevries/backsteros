import type { Task } from "@/lib/db/schema";

export const INBOX_TASK_KEY = "IN";

export function formatTaskDisplayId(
  projectKey: string,
  taskNumber: number,
): string {
  return `${projectKey}-${taskNumber}`;
}

export function getTaskDisplayId(
  task: Pick<Task, "number" | "projectId" | "contactId">,
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
