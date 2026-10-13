import type { BacksterosTask } from "./types";

const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

/**
 * Merge durable agents-API working markers (OS-96) into the displayed working
 * set used for list/detail pulses. Coding-run presence stays separate.
 */
export function mergeApiAgentWorkingTaskIds(
  workingTaskIds: ReadonlySet<string>,
  tasks: readonly BacksterosTask[],
): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const task of tasks) {
    const contactId = task.agentWorkingContactId?.trim();
    if (!contactId) continue;
    if (
      task.status === "completed" ||
      task.status === "canceled" ||
      task.status === "duplicated" ||
      task.status === "on_hold"
    ) {
      continue;
    }
    if (workingTaskIds.has(task.id)) continue;
    if (!next) next = new Set(workingTaskIds);
    next.add(task.id);
  }
  if (!next) {
    return workingTaskIds.size === 0 ? EMPTY_WORKING_TASK_IDS : workingTaskIds;
  }
  return next;
}
