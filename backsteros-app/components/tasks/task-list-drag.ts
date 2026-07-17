import type { Task } from "@/lib/db/schema";
import { migrateLegacyTaskStatus } from "@/lib/task-status";
import {
  groupAppendOrderKey,
  parseTaskDragPayload,
  taskOrderKey,
  type TaskDragPayload,
  type TaskReorderRequest,
} from "@/lib/tasks/task-list-drag-shared";

export type { TaskDragPayload, TaskReorderRequest };

export const TASK_LIST_DRAG_TYPE = "application/x-circle-task-item";

export function createTaskDragPayload(task: Task, projectId: string): string {
  const payload: TaskDragPayload = {
    taskId: task.id,
    status: migrateLegacyTaskStatus(task.status),
    projectId,
  };

  return JSON.stringify(payload);
}

export function readTaskDragPayload(
  dataTransfer: DataTransfer,
): TaskDragPayload | null {
  return parseTaskDragPayload(dataTransfer.getData(TASK_LIST_DRAG_TYPE));
}

export function isTaskListDragActive(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(TASK_LIST_DRAG_TYPE);
}

export function resolveTaskDropBeforeTask(input: {
  payload: TaskDragPayload;
  targetTask: Task;
}): TaskReorderRequest | null {
  const { payload, targetTask } = input;

  if (payload.taskId === targetTask.id) {
    return null;
  }

  const toStatus = migrateLegacyTaskStatus(targetTask.status);

  return {
    taskId: payload.taskId,
    fromStatus: payload.status,
    toStatus,
    beforeTaskId: targetTask.id,
  };
}

export function resolveTaskDropOnGroupAppend(input: {
  payload: TaskDragPayload;
  status: Task["status"];
}): TaskReorderRequest | null {
  const { payload, status } = input;
  const toStatus = migrateLegacyTaskStatus(status);

  if (payload.status === toStatus) {
    return {
      taskId: payload.taskId,
      fromStatus: payload.status,
      toStatus,
      beforeTaskId: null,
    };
  }

  return {
    taskId: payload.taskId,
    fromStatus: payload.status,
    toStatus,
    beforeTaskId: null,
  };
}

export { groupAppendOrderKey, taskOrderKey };
