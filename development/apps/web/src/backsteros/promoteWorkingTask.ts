import { useEffect } from "react";

import { resolveSidebarThreadStatus } from "~/components/Sidebar.logic";
import { useThreadShells } from "~/state/entities";

import { fetchBacksterosTask, updateBacksterosTask } from "./client";
import { useBacksterosTaskChatStore, type BacksterosTaskChatBinding } from "./taskChatStore";
import { migrateBacksterosTaskStatus, type BacksterosTaskStatus } from "./taskStatus";
import { useBacksterosWorkingTaskIds } from "./taskChatWorking";
import { clearBacksterosDisplayedAgentPresence } from "./useBacksterosAgentPresence";

const promoteInFlight = new Set<string>();
const reviewInFlight = new Set<string>();
/** Tasks that entered a working stretch (for one-shot promote + later review). */
const promoteHandledWhileWorking = new Set<string>();

export type BacksterosTaskStatusChange = {
  readonly taskId: string;
  readonly status: BacksterosTaskStatus;
};

const statusChangedListeners = new Set<(change: BacksterosTaskStatusChange) => void>();

export function subscribeBacksterosTaskStatusChanged(
  listener: (change: BacksterosTaskStatusChange) => void,
): () => void {
  statusChangedListeners.add(listener);
  return () => {
    statusChangedListeners.delete(listener);
  };
}

function publishBacksterosTaskStatusChanged(change: BacksterosTaskStatusChange) {
  for (const listener of statusChangedListeners) {
    listener(change);
  }
}

/** Notify list UIs after a manual or agent-driven status change. */
export function notifyBacksterosTaskStatusChanged(change: BacksterosTaskStatusChange) {
  publishBacksterosTaskStatusChanged(change);
}

function threadKey(environmentId: string, threadId: string): string {
  return `${environmentId}:${threadId}`;
}

/** Statuses the agent may move to In Review when a working stretch ends. */
const REVIEWABLE_STATUSES = new Set<BacksterosTaskStatus>([
  "in_progress",
  "ready_to_start",
  "on_hold",
]);

/**
 * Promote a task to `in_progress` when an agent starts working — mirrors
 * BacksterOS desktop `markTaskInProgressForAgent`.
 *
 * Any non-progress status (including completed / canceled) is reopened so a
 * continued chat always shows live work as In Progress.
 *
 * @returns true when the status was changed.
 */
export async function markBacksterosTaskInProgressForAgent(taskId: string): Promise<boolean> {
  const task = await fetchBacksterosTask(taskId);
  const status = migrateBacksterosTaskStatus(task.status);
  if (status === "in_progress") return false;
  await updateBacksterosTask(taskId, {
    status: "in_progress",
    activityActor: "agent",
  });
  return true;
}

/**
 * Move a task to `in_review` when agent work finishes — mirrors desktop
 * `reviewTaskForAgent` (status only; no assistant comment body yet).
 *
 * @returns true when the status was changed.
 */
export async function markBacksterosTaskInReviewForAgent(taskId: string): Promise<boolean> {
  const task = await fetchBacksterosTask(taskId);
  const status = migrateBacksterosTaskStatus(task.status);
  if (status === "in_review") return false;
  if (!REVIEWABLE_STATUSES.has(status)) return false;
  await updateBacksterosTask(taskId, {
    status: "in_review",
    activityActor: "agent",
  });
  return true;
}

/**
 * True when the bound chat is idle after work (not approval/input/failed).
 * Exported for focused tests.
 */
export function shouldMarkBacksterosTaskInReviewAfterWorking(input: {
  readonly binding: BacksterosTaskChatBinding | undefined;
  readonly shellsByKey: ReadonlyMap<
    string,
    {
      readonly hasPendingApprovals?: boolean;
      readonly hasPendingUserInput?: boolean;
      readonly session?: { readonly status?: string | null } | null;
      readonly backgroundLiveness?: "working" | "monitoring" | null;
    }
  >;
}): boolean {
  if (!input.binding) return false;
  const shell = input.shellsByKey.get(
    threadKey(input.binding.environmentId, input.binding.threadId),
  );
  if (!shell) return false;
  return resolveSidebarThreadStatus(shell) === "ready";
}

/**
 * When a bound task chat enters Working → `in_progress`; when that stretch
 * ends in a quiet ready state → `in_review` so the user can check the chat.
 */
export function usePromoteWorkingBacksterosTasks() {
  const workingTaskIds = useBacksterosWorkingTaskIds();
  const byTaskId = useBacksterosTaskChatStore((state) => state.byTaskId);
  const shells = useThreadShells();

  useEffect(() => {
    for (const taskId of workingTaskIds) {
      if (promoteHandledWhileWorking.has(taskId) || promoteInFlight.has(taskId)) {
        continue;
      }
      promoteInFlight.add(taskId);
      void markBacksterosTaskInProgressForAgent(taskId)
        .then((changed) => {
          promoteHandledWhileWorking.add(taskId);
          if (!changed) return;
          publishBacksterosTaskStatusChanged({ taskId, status: "in_progress" });
        })
        .catch(() => {
          // Leave unhandled so a later working tick can retry.
        })
        .finally(() => {
          promoteInFlight.delete(taskId);
        });
    }

    const shellsByKey = new Map(
      shells.map((shell) => [threadKey(shell.environmentId, shell.id), shell] as const),
    );

    for (const taskId of [...promoteHandledWhileWorking]) {
      if (workingTaskIds.has(taskId)) continue;
      if (
        !shouldMarkBacksterosTaskInReviewAfterWorking({
          binding: byTaskId[taskId],
          shellsByKey,
        })
      ) {
        // Approval / input / monitoring / missing shell: keep the stretch open.
        continue;
      }

      promoteHandledWhileWorking.delete(taskId);
      if (reviewInFlight.has(taskId)) continue;
      reviewInFlight.add(taskId);
      void markBacksterosTaskInReviewForAgent(taskId)
        .then((changed) => {
          // Work stretch ended — drop presence so the pulse cannot linger on
          // a stale remote poll while status already reads In Review.
          clearBacksterosDisplayedAgentPresence(taskId);
          if (!changed) return;
          publishBacksterosTaskStatusChanged({ taskId, status: "in_review" });
        })
        .catch(() => {
          // Best-effort; user can still set status manually.
        })
        .finally(() => {
          reviewInFlight.delete(taskId);
        });
    }
  }, [byTaskId, shells, workingTaskIds]);
}
