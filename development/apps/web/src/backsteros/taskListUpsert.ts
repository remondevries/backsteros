import type { BacksterosTask, BacksterosTaskDetail } from "./types";

/** Strip detail fields so list caches stay list-shaped. */
export function backsterosTaskListRowFromDetail(detail: BacksterosTaskDetail): BacksterosTask {
  const row: BacksterosTask = {
    id: detail.id,
    projectId: detail.projectId,
    number: detail.number,
    title: detail.title,
    status: detail.status,
    dueDate: detail.dueDate,
    updatedAt: detail.updatedAt,
    agentWorkingContactId: detail.agentWorkingContactId ?? null,
    agentWorkingStartedAt: detail.agentWorkingStartedAt ?? null,
    agentWorkingLabel: detail.agentWorkingLabel ?? null,
    agentWorkingContactName: detail.agentWorkingContactName ?? null,
  };
  if (detail.sortOrder !== undefined) {
    return {
      ...row,
      sortOrder: detail.sortOrder,
      ...(detail.priority !== undefined ? { priority: detail.priority } : {}),
    };
  }
  if (detail.priority !== undefined) {
    return { ...row, priority: detail.priority };
  }
  return row;
}

/**
 * Insert or replace a row in a ready task list. New rows prepend so the user
 * sees the task at the top of its status group without waiting on soft-poll.
 */
export function upsertBacksterosTaskInList(
  tasks: readonly BacksterosTask[],
  task: BacksterosTask,
): readonly BacksterosTask[] {
  const index = tasks.findIndex((entry) => entry.id === task.id);
  if (index < 0) {
    return [task, ...tasks];
  }
  if (tasks[index] === task) return tasks;
  const next = tasks.slice();
  next[index] = { ...tasks[index], ...task };
  return next;
}
