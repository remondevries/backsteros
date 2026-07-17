"use client";

import type { Task as ApiTask } from "@backsteros/contracts";

import { dueDateToIso } from "@/lib/entity-normalize";
import { isTaskPriority, type TaskPriority } from "@/lib/task-priority";
import { isTaskStatus, type TaskStatus } from "@/lib/task-status";
import { createId } from "@/lib/create-id";

import {
  apiErrorText,
  getMutationContext,
  patchTaskLocal,
  toLocalFields,
} from "./client";

export type CreateTaskResult =
  | { ok: true; taskId: string; taskNumber: number }
  | { ok: false; error: string };

export type CreateTaskFromComposeResult =
  | {
      ok: true;
      taskId: string;
      projectId: string | null;
      taskNumber: number;
      projectKey: string | null;
    }
  | { ok: false; error: string };

export type UpdateTaskTitleResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateTaskDescriptionResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateTaskDueDateResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateTaskAssigneeResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateTaskStatusResult =
  | {
      ok: true;
      taskNumber: number;
      projectKey: string | null;
      projectName: string | null;
      contactKey: string | null;
      title: string;
    }
  | { ok: false; error: string };

export type UpdateTaskPriorityResult =
  | { ok: true }
  | { ok: false; error: string };

export type ReorderTaskResult =
  | { ok: true }
  | { ok: false; error: string };

export type MoveTaskToProjectResult =
  | {
      ok: true;
      taskId: string;
      projectId: string | null;
      projectKey: string | null;
      contactKey: string | null;
      taskNumber: number;
    }
  | { ok: false; error: string };

export type DeleteTaskResult =
  | { ok: true; redirectHref: string }
  | { ok: false; error: string };

async function patchTask(
  taskId: string,
  body: Record<string, unknown>,
): Promise<ApiTask> {
  const { client, sync, refresh } = getMutationContext();
  await patchTaskLocal(sync, taskId, body);
  const task = await client.requestJson<ApiTask>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  refresh();
  return task;
}

export async function createTaskAction(input: {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  assigneeId?: string | null;
}): Promise<CreateTaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };

  const status =
    input.status && isTaskStatus(input.status) ? input.status : "ready_to_start";
  const dueDate = dueDateToIso(input.dueDate);
  const body = {
    projectId: input.projectId,
    title,
    description: input.description?.trim() || undefined,
    status,
    priority: 0,
    sortOrder: Date.now(),
    ...(dueDate ? { dueDate } : {}),
    assigneeId: input.assigneeId?.trim() || null,
    inbox: false,
  };

  try {
    const { client, sync, refresh } = getMutationContext();
    if (sync?.ready) {
      const taskId = await sync.createMetadata("tasks", toLocalFields(body));
      refresh();
      return { ok: true, taskId, taskNumber: 0 };
    }
    const task = await client.requestJson<ApiTask>("/api/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
    return { ok: true, taskId: task.id, taskNumber: task.number };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function createContactTaskAction(input: {
  contactId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  assigneeId?: string | null;
}): Promise<CreateTaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };
  const contactId = input.contactId.trim();
  if (!contactId) return { ok: false, error: "Contact is required." };

  const status =
    input.status && isTaskStatus(input.status) ? input.status : "ready_to_start";
  const dueDate = dueDateToIso(input.dueDate);
  const body = {
    contactId,
    title,
    description: input.description?.trim() || undefined,
    status,
    priority: 0,
    sortOrder: Date.now(),
    ...(dueDate ? { dueDate } : {}),
    assigneeId: input.assigneeId?.trim() || null,
    inbox: false,
  };

  try {
    const { client, refresh } = getMutationContext();
    const task = await client.requestJson<ApiTask>("/api/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
    return { ok: true, taskId: task.id, taskNumber: task.number };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function createInboxTaskAction(input: {
  title: string;
  description?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
}): Promise<CreateTaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };

  const dueDate = dueDateToIso(input.dueDate);
  const body = {
    title,
    description: input.description?.trim() || undefined,
    status: "triage" as const,
    priority: 0,
    sortOrder: Date.now(),
    ...(dueDate ? { dueDate } : {}),
    assigneeId: input.assigneeId?.trim() || null,
    inbox: true,
    projectId: null,
  };

  try {
    const { client, sync, refresh } = getMutationContext();
    if (sync?.ready) {
      const taskId = await sync.createMetadata("tasks", toLocalFields(body));
      refresh();
      return { ok: true, taskId, taskNumber: 0 };
    }
    const task = await client.requestJson<ApiTask>("/api/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
    return { ok: true, taskId: task.id, taskNumber: task.number };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function createTaskFromComposeAction(input: {
  title: string;
  description?: string;
  projectId: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
  assigneeId?: string | null;
}): Promise<CreateTaskFromComposeResult> {
  const projectId = input.projectId?.trim() || null;
  if (!projectId) {
    const result = await createInboxTaskAction(input);
    if (!result.ok) return result;
    return {
      ok: true,
      taskId: result.taskId,
      projectId: null,
      taskNumber: result.taskNumber,
      projectKey: null,
    };
  }

  const result = await createTaskAction({
    projectId,
    title: input.title,
    description: input.description,
    status: input.status && isTaskStatus(input.status) ? input.status : "triage",
    dueDate: input.dueDate,
    assigneeId: input.assigneeId,
  });
  if (!result.ok) return result;

  let projectKey: string | null = null;
  try {
    const { client } = getMutationContext();
    const project = await client.requestJson<{ key: string }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}`,
    );
    projectKey = project.key;
  } catch {
    projectKey = null;
  }

  return {
    ok: true,
    taskId: result.taskId,
    projectId,
    taskNumber: result.taskNumber,
    projectKey,
  };
}

export async function moveTaskToProjectAction(input: {
  taskId: string;
  projectId: string | null;
}): Promise<MoveTaskToProjectResult> {
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    const { client, sync, refresh } = getMutationContext();
    const projectId = input.projectId?.trim() || null;
    const body = { projectId, inbox: projectId === null };
    await patchTaskLocal(sync, input.taskId, body);
    const task = await client.requestJson<ApiTask>(
      `/api/v1/tasks/${encodeURIComponent(input.taskId)}/move`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      },
    );
    let projectKey: string | null = null;
    if (task.projectId) {
      try {
        const project = await client.requestJson<{ key: string }>(
          `/api/v1/projects/${encodeURIComponent(task.projectId)}`,
        );
        projectKey = project.key;
      } catch {
        projectKey = null;
      }
    }
    refresh();
    return {
      ok: true,
      taskId: task.id,
      projectId: task.projectId,
      projectKey,
      contactKey: null,
      taskNumber: task.number,
    };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function triageTaskAction(input: {
  taskId: string;
  projectId?: string | null;
  status?: TaskStatus;
}): Promise<UpdateTaskStatusResult | { ok: false; error: string }> {
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    const { client, sync, refresh } = getMutationContext();
    const body = {
      projectId: input.projectId,
      status: input.status,
    };
    await patchTaskLocal(sync, input.taskId, {
      ...body,
      inbox: false,
      triagedAt: new Date().toISOString(),
    });
    const task = await client.requestJson<ApiTask>(
      `/api/v1/tasks/${encodeURIComponent(input.taskId)}/triage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    refresh();
    return {
      ok: true,
      taskNumber: task.number,
      projectKey: null,
      projectName: null,
      contactKey: null,
      title: task.title,
    };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateTaskTitleAction(input: {
  taskId: string;
  projectId: string | null;
  title: string;
}): Promise<UpdateTaskTitleResult> {
  void input.projectId;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    await patchTask(input.taskId, { title });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateTaskDescriptionAction(input: {
  taskId: string;
  projectId: string | null;
  description: string;
}): Promise<UpdateTaskDescriptionResult> {
  void input.projectId;
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    await patchTask(input.taskId, {
      description: input.description.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateTaskDueDateAction(input: {
  taskId: string;
  projectId: string | null;
  dueDate: string | null;
}): Promise<UpdateTaskDueDateResult> {
  void input.projectId;
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    await patchTask(input.taskId, { dueDate: dueDateToIso(input.dueDate) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateTaskAssigneeAction(input: {
  taskId: string;
  projectId: string | null;
  assigneeId: string | null;
}): Promise<UpdateTaskAssigneeResult> {
  void input.projectId;
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    await patchTask(input.taskId, {
      assigneeId: input.assigneeId?.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateTaskStatusAction(input: {
  taskId: string;
  projectId: string | null;
  status: TaskStatus;
}): Promise<UpdateTaskStatusResult> {
  void input.projectId;
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  if (!isTaskStatus(input.status)) return { ok: false, error: "Invalid status." };
  try {
    const task = await patchTask(input.taskId, { status: input.status });
    let projectKey: string | null = null;
    let projectName: string | null = null;
    if (task.projectId) {
      try {
        const { client } = getMutationContext();
        const project = await client.requestJson<{ key: string; name: string }>(
          `/api/v1/projects/${encodeURIComponent(task.projectId)}`,
        );
        projectKey = project.key;
        projectName = project.name;
      } catch {
        // ignore lookup failure
      }
    }
    return {
      ok: true,
      taskNumber: task.number,
      projectKey,
      projectName,
      contactKey: null,
      title: task.title,
    };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateTaskPriorityAction(input: {
  taskId: string;
  projectId: string | null;
  priority: TaskPriority;
}): Promise<UpdateTaskPriorityResult> {
  void input.projectId;
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  if (!isTaskPriority(input.priority)) {
    return { ok: false, error: "Invalid priority." };
  }
  try {
    await patchTask(input.taskId, { priority: input.priority });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

/**
 * Circle reorder uses beforeTaskId + status. BacksterOS exposes orderedIds,
 * so we load the project column, apply the move, then POST /tasks/reorder.
 */
export async function reorderTaskAction(input: {
  projectId: string;
  taskId: string;
  toStatus: TaskStatus;
  beforeTaskId?: string | null;
}): Promise<ReorderTaskResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  if (!isTaskStatus(input.toStatus)) return { ok: false, error: "Invalid status." };
  if (input.beforeTaskId === input.taskId) {
    return { ok: false, error: "Invalid drop target." };
  }

  try {
    const { client, sync, refresh } = getMutationContext();
    const { tasks } = await client.requestJson<{ tasks: ApiTask[] }>(
      `/api/v1/tasks?projectId=${encodeURIComponent(input.projectId)}`,
    );

    const moving = tasks.find((task) => task.id === input.taskId);
    if (!moving) return { ok: false, error: "Task not found." };

    const without = tasks.filter((task) => task.id !== input.taskId);
    const targetGroup = without
      .filter((task) => task.status === input.toStatus)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const beforeTaskId = input.beforeTaskId ?? null;
    let nextGroup: ApiTask[];
    if (!beforeTaskId) {
      nextGroup = [...targetGroup, { ...moving, status: input.toStatus }];
    } else {
      const insertIndex = targetGroup.findIndex((task) => task.id === beforeTaskId);
      if (insertIndex === -1) {
        nextGroup = [...targetGroup, { ...moving, status: input.toStatus }];
      } else {
        nextGroup = [
          ...targetGroup.slice(0, insertIndex),
          { ...moving, status: input.toStatus },
          ...targetGroup.slice(insertIndex),
        ];
      }
    }

    await patchTaskLocal(sync, input.taskId, { status: input.toStatus });
    if (moving.status !== input.toStatus) {
      await client.requestJson(`/api/v1/tasks/${encodeURIComponent(input.taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: input.toStatus }),
      });
    }

    const otherIds = without
      .filter((task) => task.status !== input.toStatus)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((task) => task.id);
    const orderedIds = [...otherIds, ...nextGroup.map((task) => task.id)];

    await client.requestJson("/api/v1/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });

    if (sync?.ready) {
      await Promise.all(
        nextGroup.map((task, index) =>
          sync.patchMetadata(
            "tasks",
            task.id,
            toLocalFields({ sortOrder: index * 10, status: task.status }),
          ),
        ),
      );
    }

    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function deleteTaskAction(input: {
  taskId: string;
  pathname?: string;
  search?: string;
}): Promise<DeleteTaskResult> {
  void input.search;
  if (!input.taskId.trim()) return { ok: false, error: "Task is required." };
  try {
    const { client, sync, refresh } = getMutationContext();
    await patchTaskLocal(sync, input.taskId, {
      deletedAt: new Date().toISOString(),
    });
    await client.requestJson(`/api/v1/tasks/${encodeURIComponent(input.taskId)}`, {
      method: "DELETE",
    });
    refresh();
    const redirectHref = input.pathname?.trim() || "/inbox";
    return { ok: true, redirectHref };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

/** Convenience for optimistic local id generation in UI stubs. */
export function newClientTaskId() {
  return createId();
}
