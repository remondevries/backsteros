import type { Contact, Project, Task } from "@backsteros/contracts";

import type { GroupedTaskRow } from "../components/grouped-task-list";
import { getTaskDisplayId } from "./task-display-id";

type ContactLike =
  | Contact
  | {
      id: string;
      name: string | null;
      avatarStorageKey?: string | null;
    };

export function contactsByIdFromList(
  contacts: readonly ContactLike[],
): Map<string, ContactLike> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

export function mapApiTaskToRow(
  task: Task,
  projectsById: Map<string, Project> = new Map(),
  contactsById: Map<string, ContactLike> = new Map(),
): GroupedTaskRow {
  const project = task.projectId
    ? projectsById.get(task.projectId)
    : undefined;
  const assigneeId = task.assigneeId ?? task.contactId;
  const assignee = assigneeId ? contactsById.get(assigneeId) : undefined;
  const avatarStorageKey =
    assignee && "avatarStorageKey" in assignee
      ? (assignee.avatarStorageKey ?? null)
      : null;

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate,
    project_name: project?.name ?? null,
    project_key: project?.key ?? null,
    project_icon: project?.icon ?? null,
    project_type: project?.type ?? null,
    assignee_id: assigneeId,
    assignee_name: assignee?.name?.trim() || null,
    assignee_avatar_storage_key: avatarStorageKey,
    display_id: getTaskDisplayId(
      {
        number: task.number,
        projectId: task.projectId,
        contactId: task.contactId,
      },
      project?.key,
    ),
  };
}

export function withDisplayId<
  T extends {
    number?: number | null;
    project_id?: string | null;
    contact_id?: string | null;
    project_key?: string | null;
  },
>(row: T): T & { display_id: string | null } {
  return {
    ...row,
    display_id: getTaskDisplayId(
      {
        number: row.number,
        projectId: row.project_id,
        contactId: row.contact_id,
      },
      row.project_key,
    ),
  };
}
