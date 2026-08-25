import {
  buildTaskDueDatePatch,
  isMeetingTaskListItem,
  type TaskBulkPatch,
  type TaskItemRowTask,
} from "@backsteros/ui";
import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  isEmailTaskListItem,
  patchEmailTaskListItem,
  type EmailTaskListPatchExtras,
} from "./email-list-tasks";
import type { DesktopWorkspaceData } from "./workspace/workspace-data-types";

type TaskListPatchDeps = {
  client: Pick<BacksterosApiClient, "requestJson">;
  workspace: Pick<
    DesktopWorkspaceData,
    "patchTask" | "patchMeeting" | "projects" | "contacts"
  >;
};

function resolveProject(
  deps: TaskListPatchDeps,
  projectKey: string | null | undefined,
) {
  return projectKey
    ? deps.workspace.projects.find((entry) => entry.key === projectKey) ?? null
    : null;
}

/** Persist a property edit for a task, email, or meeting list row. */
export async function patchTaskListRow(
  deps: TaskListPatchDeps,
  task: TaskItemRowTask,
  patch: TaskBulkPatch,
): Promise<void> {
  if (isEmailTaskListItem(task)) {
    const emailPatch: Parameters<typeof patchEmailTaskListItem>[2] = {};
    const listExtras: EmailTaskListPatchExtras = {};
    if (patch.status !== undefined) emailPatch.status = patch.status;
    if (patch.priority !== undefined) emailPatch.priority = patch.priority;
    if ("dueDate" in patch) {
      emailPatch.dueDate = patch.dueDate ? patch.dueDate.toISOString() : null;
    }
    if ("projectKey" in patch) {
      const project = resolveProject(deps, patch.projectKey ?? null);
      emailPatch.projectId = project?.id ?? null;
      listExtras.projectName = project?.name ?? null;
      listExtras.projectKey = project?.key ?? null;
    }
    if ("assigneeId" in patch) {
      emailPatch.assigneeId = patch.assigneeId ?? null;
      const assignee = patch.assigneeId
        ? deps.workspace.contacts.find(
            (entry) => entry.id === patch.assigneeId,
          ) ?? null
        : null;
      listExtras.assigneeName = assignee?.name ?? null;
    }
    if (Object.keys(emailPatch).length === 0) return;
    await patchEmailTaskListItem(deps.client, task, emailPatch, listExtras);
    return;
  }

  if (isMeetingTaskListItem(task)) {
    const meetingPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) meetingPatch.status = patch.status;
    if (patch.priority !== undefined) meetingPatch.priority = patch.priority;
    if ("projectKey" in patch) {
      const project = resolveProject(deps, patch.projectKey ?? null);
      meetingPatch.projectId = project?.id ?? null;
    }
    if (Object.keys(meetingPatch).length === 0) return;
    await deps.workspace.patchMeeting(task.id, meetingPatch);
    return;
  }

  const taskPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) taskPatch.status = patch.status;
  if (patch.priority !== undefined) taskPatch.priority = patch.priority;
  if ("dueDate" in patch) {
    Object.assign(taskPatch, buildTaskDueDatePatch(patch.dueDate ?? null));
  }
  if ("projectKey" in patch) {
    const project = resolveProject(deps, patch.projectKey ?? null);
    taskPatch.projectId = project?.id ?? null;
  }
  if ("assigneeId" in patch) {
    taskPatch.assigneeId = patch.assigneeId ?? null;
  }
  if (Object.keys(taskPatch).length === 0) return;
  await deps.workspace.patchTask(task.id, taskPatch);
}

export async function patchTaskListRows(
  deps: TaskListPatchDeps,
  tasks: readonly TaskItemRowTask[],
  patch: TaskBulkPatch,
): Promise<void> {
  await Promise.all(tasks.map((task) => patchTaskListRow(deps, task, patch)));
}
