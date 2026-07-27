import { migrateLegacyTaskStatus, type TaskStatus } from "@/lib/task-status";

export type TaskDragPayload = {
  taskId: string;
  status: TaskStatus;
  projectId: string;
};

export type TaskReorderRequest = {
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  beforeTaskId: string | null;
};

const TASK_ORDER_KEY_PREFIX = "task:";
const GROUP_APPEND_KEY_PREFIX = "group-append:";

export function taskOrderKey(taskId: string): string {
  return `${TASK_ORDER_KEY_PREFIX}${taskId}`;
}

export function groupAppendOrderKey(status: TaskStatus): string {
  return `${GROUP_APPEND_KEY_PREFIX}${status}`;
}

export function parseTaskOrderKey(
  key: string,
): { type: "task"; taskId: string } | { type: "group-append"; status: TaskStatus } | null {
  if (key.startsWith(TASK_ORDER_KEY_PREFIX)) {
    const taskId = key.slice(TASK_ORDER_KEY_PREFIX.length);
    return taskId ? { type: "task", taskId } : null;
  }

  if (key.startsWith(GROUP_APPEND_KEY_PREFIX)) {
    const status = migrateLegacyTaskStatus(
      key.slice(GROUP_APPEND_KEY_PREFIX.length),
    );
    return { type: "group-append", status };
  }

  return null;
}

export function parseTaskDragPayload(raw: string): TaskDragPayload | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (
      typeof record.taskId !== "string" ||
      typeof record.status !== "string" ||
      typeof record.projectId !== "string"
    ) {
      return null;
    }

    return {
      taskId: record.taskId,
      status: migrateLegacyTaskStatus(record.status),
      projectId: record.projectId,
    };
  } catch {
    return null;
  }
}
