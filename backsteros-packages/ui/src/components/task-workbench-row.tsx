"use client";

/**
 * @deprecated Prefer `TaskItemRow` — this is a compatibility alias so existing
 * imports keep working while every surface shares one implementation.
 */
export {
  TaskItemRow as TaskWorkbenchRow,
  type TaskItemRowProps as TaskWorkbenchRowProps,
  type TaskItemRowTask as TaskOverviewRowTask,
} from "./task-item-row.js";
