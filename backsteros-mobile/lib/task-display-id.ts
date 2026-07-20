/** Same rules as `@backsteros/ui` `getTaskDisplayId`. */

export const INBOX_TASK_KEY = "IN";

export function formatTaskDisplayId(
  projectKey: string,
  taskNumber: number,
): string {
  return `${projectKey}-${taskNumber}`;
}

export function getTaskDisplayId(
  task: {
    number: number | null | undefined;
    projectId?: string | null;
    contactId?: string | null;
  },
  projectKey?: string | null,
): string | null {
  if (!task.number) return null;
  if (projectKey) return formatTaskDisplayId(projectKey, task.number);
  if (task.contactId) return null;
  if (task.projectId) return null;
  return formatTaskDisplayId(INBOX_TASK_KEY, task.number);
}
