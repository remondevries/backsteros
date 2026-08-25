import type { TaskBulkPatch } from "../components/tasks/task-bulk-edit-bar.js";
import type { TaskItemRowTask } from "../components/tasks/task-item-row.js";
import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import type { TaskListOptimisticPatch } from "./merge-task-list-optimistic.js";
import type { TaskStatus } from "./task-status.js";

export function applyOptimisticTaskBulkPatch(input: {
  tasks: readonly TaskItemRowTask[];
  patch: TaskBulkPatch;
  patchTask: (taskId: string, patch: TaskListOptimisticPatch) => void;
  setLocalTasks: (
    updater: (current: TaskItemRowTask[]) => TaskItemRowTask[],
  ) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onStatusApplied?: (status: TaskStatus) => void;
}): void {
  const {
    tasks,
    patch,
    patchTask,
    setLocalTasks,
    assigneeOptions = [],
    projectOptions = [],
    onStatusApplied,
  } = input;
  const selectedIds = new Set(tasks.map((task) => task.id));
  if (selectedIds.size === 0) return;

  for (const task of tasks) {
    if (patch.status !== undefined) {
      patchTask(task.id, { status: patch.status });
      onStatusApplied?.(patch.status);
    }
    if (patch.priority !== undefined) {
      patchTask(task.id, { priority: patch.priority });
    }
    if ("dueDate" in patch) {
      patchTask(task.id, {
        dueDate: patch.dueDate ? patch.dueDate.getTime() : null,
      });
    }
    if ("projectKey" in patch) {
      const option = patch.projectKey
        ? projectOptions.find((entry) => entry.value === patch.projectKey)
        : null;
      patchTask(task.id, {
        projectKey: patch.projectKey ?? null,
        projectName: option?.label ?? null,
      });
    }
    if ("assigneeId" in patch) {
      const option = assigneeOptions.find(
        (entry) => entry.value === (patch.assigneeId ?? "__none__"),
      );
      const ownerInitials = option?.label
        ?.split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2);
      patchTask(task.id, {
        assigneeId: patch.assigneeId ?? null,
        ownerInitials,
      });
    }
  }

  setLocalTasks((current) =>
    current.map((row) => {
      if (!selectedIds.has(row.id)) return row;
      let next = row;
      if (patch.status !== undefined) {
        next = { ...next, status: patch.status };
      }
      if (patch.priority !== undefined) {
        next = { ...next, priority: patch.priority };
      }
      if ("dueDate" in patch) {
        next = {
          ...next,
          dueDate: patch.dueDate ? patch.dueDate.getTime() : null,
        };
      }
      if ("projectKey" in patch) {
        const option = patch.projectKey
          ? projectOptions.find((entry) => entry.value === patch.projectKey)
          : null;
        next = {
          ...next,
          projectKey: patch.projectKey ?? null,
          projectName: option?.label ?? null,
        };
      }
      if ("assigneeId" in patch) {
        const option = assigneeOptions.find(
          (entry) => entry.value === (patch.assigneeId ?? "__none__"),
        );
        const ownerInitials = option?.label
          ?.split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2);
        next = {
          ...next,
          assigneeId: patch.assigneeId ?? null,
          ownerInitials,
        };
      }
      return next;
    }),
  );
}
