import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status.js";
import type { TaskReorderRequest } from "./task-list-drag.js";

export type TaskLikeForReorder = {
  id: string;
  status: string;
  sortOrder?: number;
};

function sortTasksInStatusGroup<T extends TaskLikeForReorder>(tasks: T[]): T[] {
  return [...tasks].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
}

function assignSortOrdersForStatusGroup<T extends TaskLikeForReorder>(
  tasks: T[],
): T[] {
  return tasks.map((task, index) => ({
    ...task,
    sortOrder: index * 10,
  }));
}

export function applyOptimisticTaskReorder<T extends TaskLikeForReorder>(
  tasks: T[],
  request: TaskReorderRequest,
): T[] {
  const movingTask = tasks.find((task) => task.id === request.taskId);
  if (!movingTask) {
    return tasks;
  }

  const withoutMoving = tasks.filter((task) => task.id !== request.taskId);
  const updatedMoving = {
    ...movingTask,
    status: request.toStatus,
  };

  const targetSiblings = sortTasksInStatusGroup(
    withoutMoving.filter(
      (task) => migrateLegacyTaskStatus(task.status) === request.toStatus,
    ),
  );

  let nextTargetGroup: T[];
  if (!request.beforeTaskId) {
    nextTargetGroup = [...targetSiblings, updatedMoving];
  } else {
    const insertIndex = targetSiblings.findIndex(
      (task) => task.id === request.beforeTaskId,
    );

    if (insertIndex === -1) {
      nextTargetGroup = [...targetSiblings, updatedMoving];
    } else {
      nextTargetGroup = [
        ...targetSiblings.slice(0, insertIndex),
        updatedMoving,
        ...targetSiblings.slice(insertIndex),
      ];
    }
  }

  const reindexed = assignSortOrdersForStatusGroup(nextTargetGroup);
  const byId = new Map(reindexed.map((task) => [task.id, task]));

  return [
    ...withoutMoving.map((task) => byId.get(task.id) ?? task),
    ...reindexed.filter((task) => task.id === request.taskId),
  ];
}

/** Status + sortOrder patches for the target group after a reorder. */
export function taskReorderPatches(
  tasks: TaskLikeForReorder[],
  request: TaskReorderRequest,
): Array<{ id: string; status: TaskStatus; sortOrder: number }> {
  const next = applyOptimisticTaskReorder(tasks, request);
  return next
    .filter(
      (task) => migrateLegacyTaskStatus(task.status) === request.toStatus,
    )
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((task, index) => ({
      id: task.id,
      status: migrateLegacyTaskStatus(task.status),
      sortOrder: index * 10,
    }));
}
