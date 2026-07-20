import type { Project, Task } from "@backsteros/contracts";

import type { GroupedTaskRow } from "../components/grouped-task-list";
import { getTaskDisplayId } from "./task-display-id";

export function mapApiTaskToRow(
  task: Task,
  projectsById: Map<string, Project> = new Map(),
): GroupedTaskRow {
  const project = task.projectId
    ? projectsById.get(task.projectId)
    : undefined;

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate,
    project_name: project?.name ?? null,
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
