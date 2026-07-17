import type { Task } from "@/lib/db/schema";
import { migrateLegacyTaskStatus } from "@/lib/task-status";

import type { TaskReorderRequest } from "./task-list-drag-shared";

function compareTasksForDisplay(left: Task, right: Task): number {
  const sortOrderDelta = left.sortOrder - right.sortOrder;
  if (sortOrderDelta !== 0) {
    return sortOrderDelta;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

function sortTasksInStatusGroup(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasksForDisplay);
}

function assignSortOrdersForStatusGroup(tasks: Task[]): Task[] {
  return tasks.map((task, index) => ({
    ...task,
    sortOrder: index * 10,
  }));
}

export function applyOptimisticTaskReorder(
  tasks: Task[],
  request: TaskReorderRequest,
): Task[] {
  const movingTask = tasks.find((task) => task.id === request.taskId);
  if (!movingTask) {
    return tasks;
  }

  const withoutMoving = tasks.filter((task) => task.id !== request.taskId);
  const updatedMoving: Task = {
    ...movingTask,
    status: request.toStatus,
  };

  const targetSiblings = sortTasksInStatusGroup(
    withoutMoving.filter(
      (task) => migrateLegacyTaskStatus(task.status) === request.toStatus,
    ),
  );

  let nextTargetGroup: Task[];
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
