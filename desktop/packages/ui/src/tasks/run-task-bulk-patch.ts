import type { TaskBulkPatch } from "../components/tasks/task-bulk-edit-bar.js";
import type { TaskItemRowTask } from "../components/tasks/task-item-row.js";
import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { applyOptimisticTaskBulkPatch } from "./apply-optimistic-task-bulk-patch.js";
import type { TaskListOptimisticPatch } from "./merge-task-list-optimistic.js";
import type { TaskStatus } from "./task-status.js";

export type TaskBulkPatchLegacyHandlers = {
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (
    taskId: string,
    dueDate: Date | null,
    dueEndDate?: Date | null,
  ) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
};

/** Apply a bulk property edit to mixed task / email / meeting list rows. */
export async function runTaskBulkPatch(input: {
  selectedTasks: readonly TaskItemRowTask[];
  patch: TaskBulkPatch;
  patchTask: (taskId: string, patch: TaskListOptimisticPatch) => void;
  setLocalTasks: (
    updater: (current: TaskItemRowTask[]) => TaskItemRowTask[],
  ) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onStatusApplied?: (status: TaskStatus) => void;
  onBulkPatch?: (
    tasks: readonly TaskItemRowTask[],
    patch: TaskBulkPatch,
  ) => void | Promise<void>;
  legacyHandlers?: TaskBulkPatchLegacyHandlers;
}): Promise<void> {
  const { selectedTasks, patch, onBulkPatch, legacyHandlers } = input;
  if (selectedTasks.length === 0) return;

  applyOptimisticTaskBulkPatch({
    tasks: selectedTasks,
    patch,
    patchTask: input.patchTask,
    setLocalTasks: input.setLocalTasks,
    assigneeOptions: input.assigneeOptions,
    projectOptions: input.projectOptions,
    onStatusApplied: input.onStatusApplied,
  });

  if (onBulkPatch) {
    await Promise.resolve(onBulkPatch(selectedTasks, patch));
    return;
  }

  for (const task of selectedTasks) {
    if (patch.status !== undefined) {
      legacyHandlers?.onStatusChange?.(task.id, patch.status);
    }
    if (patch.priority !== undefined) {
      legacyHandlers?.onPriorityChange?.(task.id, patch.priority);
    }
    if ("dueDate" in patch) {
      legacyHandlers?.onDueDateChange?.(task.id, patch.dueDate ?? null);
    }
    if ("projectKey" in patch) {
      legacyHandlers?.onProjectChange?.(task.id, patch.projectKey ?? null);
    }
    if ("assigneeId" in patch) {
      legacyHandlers?.onAssigneeChange?.(task.id, patch.assigneeId ?? null);
    }
  }
}
