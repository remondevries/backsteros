import { useEffect } from "react";

import { resolveSidebarThreadStatus } from "~/components/Sidebar.logic";
import { useThreadShells } from "~/state/entities";

import { fetchBacksterosTask, updateBacksterosTask } from "./client";
import {
  clearPendingBacksterosTaskStatus,
  setPendingBacksterosTaskStatus,
} from "./pendingTaskStatus";
import { useBacksterosTaskChatStore, type BacksterosTaskChatBinding } from "./taskChatStore";
import { migrateBacksterosTaskStatus, type BacksterosTaskStatus } from "./taskStatus";
import { useBacksterosWorkingTaskIds } from "./taskChatWorking";
import { clearBacksterosDisplayedAgentPresence } from "./useBacksterosAgentPresence";
import { patchBacksterosInboxTaskStatusLocal } from "./useBacksterosInboxAttentionTasks";
import { patchBacksterosProjectTaskStatusLocal } from "./useBacksterosProjectTasks";

const promoteInFlight = new Set<string>();
const reviewInFlight = new Set<string>();
/** Tasks that entered a working stretch (for one-shot promote + later review). */
const promoteHandledWhileWorking = new Set<string>();

export type BacksterosTaskStatusChange = {
  readonly taskId: string;
  readonly status: BacksterosTaskStatus;
  /** When known, targets the project list cache directly. */
  readonly projectId?: string | null;
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
  setPendingBacksterosTaskStatus(change.taskId, change.status);
  // Update shared list caches here — do not rely on React listeners (they often
  // no-op when the projects rail has no selection, inbox is unsubscribed, or
  // promote runs before the subscribe effect rebinds patchLocalTask).
  patchBacksterosProjectTaskStatusLocal(change.taskId, change.status, change.projectId);
  patchBacksterosInboxTaskStatusLocal(change.taskId, change.status);
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

async function restoreBacksterosTaskStatusFromServer(taskId: string): Promise<void> {
  clearPendingBacksterosTaskStatus(taskId);
  try {
    const task = await fetchBacksterosTask(taskId);
    publishBacksterosTaskStatusChanged({
      taskId,
      status: migrateBacksterosTaskStatus(task.status),
    });
  } catch {
    // Soft-poll will eventually reconcile.
  }
}

/**
 * Promote a task to `in_progress` when an agent starts working — mirrors
 * BacksterOS desktop `markTaskInProgressForAgent`.
 *
 * Skips a preliminary GET: the UI already moved optimistically, and a no-op
 * PATCH when already in progress is cheaper than a round-trip race.
 *
 * @returns true when the status write was attempted successfully.
 */
export async function markBacksterosTaskInProgressForAgent(taskId: string): Promise<boolean> {
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
 * Skips a preliminary GET so a fast finish cannot race an in-flight
 * in_progress write and refuse the review transition.
 *
 * @returns true when the status write was attempted successfully.
 */
export async function markBacksterosTaskInReviewForAgent(taskId: string): Promise<boolean> {
  await updateBacksterosTask(taskId, {
    status: "in_review",
    activityActor: "agent",
  });
  return true;
}

/**
 * True when the bound chat is idle after work (ready or failed — not
 * approval/input/monitoring). Exported for focused tests.
 */
export function shouldMarkBacksterosTaskInReviewAfterWorking(input: {
  readonly binding: BacksterosTaskChatBinding | undefined;
  readonly shellsByKey: ReadonlyMap<
    string,
    {
      readonly hasPendingApprovals?: boolean | undefined;
      readonly hasPendingUserInput?: boolean | undefined;
      readonly session?: { readonly status?: string | null | undefined } | null | undefined;
      readonly backgroundLiveness?: "working" | "monitoring" | null | undefined;
    }
  >;
}): boolean {
  if (!input.binding) return false;
  const shell = input.shellsByKey.get(
    threadKey(input.binding.environmentId, input.binding.threadId),
  );
  if (!shell) return false;
  const status = resolveSidebarThreadStatus(
    shell as Parameters<typeof resolveSidebarThreadStatus>[0],
  );
  // Ready = turn done; failed = agent stopped with an error. Both should land
  // In Review so the user can check the chat (matches finished-sound).
  return status === "ready" || status === "failed";
}

/**
 * When a bound task chat enters Working → `in_progress`; when that stretch
 * ends in a quiet ready state → `in_review` so the user can check the chat.
 * Safe to mount from Panel + Overview: in-flight sets dedupe status writes.
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
      // Optimistic: move the row into In Progress with the working pulse —
      // don't wait on GET+PATCH (soft-poll can otherwise leave it in In Review).
      promoteHandledWhileWorking.add(taskId);
      publishBacksterosTaskStatusChanged({
        taskId,
        status: "in_progress",
        projectId: byTaskId[taskId]?.backsterosProjectId ?? null,
      });
      void markBacksterosTaskInProgressForAgent(taskId)
        .catch(() => {
          promoteHandledWhileWorking.delete(taskId);
          void restoreBacksterosTaskStatusFromServer(taskId);
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
          shellsByKey: shellsByKey as Parameters<
            typeof shouldMarkBacksterosTaskInReviewAfterWorking
          >[0]["shellsByKey"],
        })
      ) {
        // Approval / input / monitoring / missing shell: keep the stretch open.
        continue;
      }

      promoteHandledWhileWorking.delete(taskId);
      if (reviewInFlight.has(taskId)) continue;
      reviewInFlight.add(taskId);
      // Stop the pulse and move the group immediately; persist in the background.
      clearBacksterosDisplayedAgentPresence(taskId);
      publishBacksterosTaskStatusChanged({
        taskId,
        status: "in_review",
        projectId: byTaskId[taskId]?.backsterosProjectId ?? null,
      });
      void markBacksterosTaskInReviewForAgent(taskId)
        .catch(() => {
          void restoreBacksterosTaskStatusFromServer(taskId);
        })
        .finally(() => {
          reviewInFlight.delete(taskId);
        });
    }
  }, [byTaskId, shells, workingTaskIds]);
}
