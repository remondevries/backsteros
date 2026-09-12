import type { BacksterosTask, BacksterosTaskDetail } from "./types";

/** Strip detail fields so list caches stay list-shaped. */
export function backsterosTaskListRowFromDetail(detail: BacksterosTaskDetail): BacksterosTask {
  return {
    id: detail.id,
    projectId: detail.projectId,
    number: detail.number,
    title: detail.title,
    status: detail.status,
    sortOrder: detail.sortOrder,
    dueDate: detail.dueDate,
    priority: detail.priority,
    updatedAt: detail.updatedAt,
  };
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
