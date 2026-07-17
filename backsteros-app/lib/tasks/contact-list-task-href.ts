import type { Task } from "@/lib/db/schema";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import { getContactScopedTaskHref } from "@/lib/navigation/preserve-section-href";

type ContactListTaskProject = {
  id: string;
  key: string;
};

export function getContactListTaskHref(
  task: Pick<Task, "id" | "projectId" | "contactId" | "number">,
  contactKey: string,
  contactId: string,
  projects: readonly ContactListTaskProject[],
  pathname?: string,
): string {
  return getContactScopedTaskHref(task, contactKey, contactId, projects, pathname);
}

export function getContactListTaskProjectKey(
  task: Pick<Task, "projectId" | "contactId">,
  contactKey: string,
  contactId: string,
  projects: readonly ContactListTaskProject[],
): string {
  if (task.projectId) {
    return projects.find((entry) => entry.id === task.projectId)?.key ?? contactKey;
  }

  if (task.contactId === contactId) {
    return contactKey;
  }

  return INBOX_TASK_KEY;
}
