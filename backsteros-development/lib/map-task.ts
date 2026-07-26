import type { Project as ApiProject, Task as ApiTask } from "@backsteros/contracts";
import {
  formatTaskDisplayId,
  type TaskDetailViewTask,
  type TaskItemRowTask,
} from "@backsteros/ui";

function asEpoch(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function mapApiTask(
  task: ApiTask,
  projectsById: Map<string, ApiProject>,
): TaskItemRowTask {
  const project = task.projectId
    ? (projectsById.get(task.projectId) ?? null)
    : null;
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: asEpoch(task.dueDate),
    projectId: task.projectId,
    projectKey: project?.key ?? null,
    projectName: project?.name ?? null,
    contactId: task.contactId,
    assigneeId: task.assigneeId,
    sortOrder: task.sortOrder,
  };
}

export function mapApiTaskDetail(
  task: ApiTask,
  projectsById: Map<string, ApiProject>,
): TaskDetailViewTask {
  const project = task.projectId
    ? (projectsById.get(task.projectId) ?? null)
    : null;
  const projectKey = project?.key ?? null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    links: task.links ?? [],
    displayId:
      projectKey && task.number
        ? formatTaskDisplayId(projectKey, task.number)
        : null,
    status: task.status,
    priority: task.priority,
    dueDate: asEpoch(task.dueDate),
    assigneeId: task.assigneeId,
    projectKey,
    projectName: project?.name ?? null,
  };
}
