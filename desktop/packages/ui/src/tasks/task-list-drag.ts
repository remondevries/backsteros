import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status.js";

export type TaskReorderRequest = {
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  beforeTaskId: string | null;
};

export type TaskDragPayload = {
  taskId: string;
  status: TaskStatus;
};

export type TaskLikeForDrag = {
  id: string;
  status: string;
};

export const TASK_LIST_DRAG_TYPE = "application/x-backsteros-task-item";

/** Fallback — custom MIME types are often invisible during dragover in WKWebView/Tauri. */
export const TASK_LIST_DRAG_FALLBACK_TYPE = "text/plain";

export function taskOrderKey(taskId: string): string {
  return `task:${taskId}`;
}

export function taskGroupAppendOrderKey(status: TaskStatus): string {
  return `task-group:${status}:append`;
}

export function createTaskDragPayload(task: TaskLikeForDrag): string {
  const payload: TaskDragPayload = {
    taskId: task.id,
    status: migrateLegacyTaskStatus(task.status),
  };

  return JSON.stringify(payload);
}

function parseTaskDragPayload(rawPayload: string): TaskDragPayload | null {
  try {
    const payload = JSON.parse(rawPayload) as Partial<TaskDragPayload>;
    if (
      typeof payload.taskId !== "string" ||
      typeof payload.status !== "string"
    ) {
      return null;
    }

    return {
      taskId: payload.taskId,
      status: migrateLegacyTaskStatus(payload.status),
    };
  } catch {
    return null;
  }
}

export function readTaskDragPayload(
  dataTransfer: DataTransfer,
): TaskDragPayload | null {
  const custom = dataTransfer.getData(TASK_LIST_DRAG_TYPE);
  if (custom) return parseTaskDragPayload(custom);
  const fallback = dataTransfer.getData(TASK_LIST_DRAG_FALLBACK_TYPE);
  if (fallback) return parseTaskDragPayload(fallback);
  return null;
}

export function writeTaskDragPayload(
  dataTransfer: DataTransfer,
  task: TaskLikeForDrag,
): void {
  const payload = createTaskDragPayload(task);
  dataTransfer.setData(TASK_LIST_DRAG_TYPE, payload);
  dataTransfer.setData(TASK_LIST_DRAG_FALLBACK_TYPE, payload);
}

export function isTaskListDragActive(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes(TASK_LIST_DRAG_TYPE) ||
    types.includes(TASK_LIST_DRAG_FALLBACK_TYPE)
  );
}

export function resolveTaskDropBeforeTask(input: {
  payload: TaskDragPayload;
  targetTask: TaskLikeForDrag;
}): TaskReorderRequest | null {
  const { payload, targetTask } = input;
  if (payload.taskId === targetTask.id) return null;

  return {
    taskId: payload.taskId,
    fromStatus: payload.status,
    toStatus: migrateLegacyTaskStatus(targetTask.status),
    beforeTaskId: targetTask.id,
  };
}

export function resolveTaskDropOnGroupAppend(input: {
  payload: TaskDragPayload;
  status: TaskStatus;
}): TaskReorderRequest {
  return {
    taskId: input.payload.taskId,
    fromStatus: input.payload.status,
    toStatus: input.status,
    beforeTaskId: null,
  };
}
