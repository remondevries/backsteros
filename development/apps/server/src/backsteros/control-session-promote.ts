/**
 * Best-effort BacksterOS task status sync for control-API-only sessions (no web UI).
 * Call from non-GET handlers (POST start / message / promote) and when a bound
 * turn completes (CheckpointReactor) — never from status or session-list GETs
 * (OS-38 read-only).
 */
import {
  backsterosStatusForControlSession,
  type BacksterosControlSessionStatus,
} from "@t3tools/shared/backsterosTaskAutoPromote";

import { patchBacksterosControlTaskStatus } from "./control-backsteros.ts";
import { findBacksterosTaskThreadBinding } from "./task-thread-bindings.ts";

const lastPromotedStatus = new Map<string, BacksterosControlSessionStatus>();
const idlePromoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Generations bump on activity so a stale timer cannot promote after cancel. */
const idlePromoteGenerations = new Map<string, number>();

/** Debounce ready→in_review so brief session gaps do not flip status (mirrors web OS-15). */
export const CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS = 5_000;

export function resetControlSessionPromoteStateForTests(): void {
  lastPromotedStatus.clear();
  for (const timer of idlePromoteTimers.values()) {
    clearTimeout(timer);
  }
  idlePromoteTimers.clear();
  idlePromoteGenerations.clear();
}

/**
 * Cancel a pending idle→in_review timer (new turn, message, interrupt/fail).
 * No-op when the thread is not control/web-bound in the bindings file.
 */
export function cancelControlSessionIdlePromote(stateDir: string, threadId: string): void {
  const found = findBacksterosTaskThreadBinding(stateDir, { threadId });
  if (!found) return;
  cancelIdlePromoteForTask(found.taskId);
}

function cancelIdlePromoteForTask(taskId: string): void {
  const existing = idlePromoteTimers.get(taskId);
  if (existing) {
    clearTimeout(existing);
    idlePromoteTimers.delete(taskId);
  }
  idlePromoteGenerations.set(taskId, (idlePromoteGenerations.get(taskId) ?? 0) + 1);
}

export type ControlSessionPromoteThread = {
  readonly sessionStatus?: string | null;
  readonly lastError?: string | null;
};

/**
 * A rejected turn (session `error`, or `stopped` with `lastError`) must not
 * look like a successful completion. Those snapshots often read as idle/done
 * and would otherwise auto-flip to `in_review` (OS-91).
 */
export function controlSessionFailedToComplete(
  thread?: ControlSessionPromoteThread | null,
): boolean {
  if (!thread) return false;
  if (thread.sessionStatus === "error") return true;
  return thread.sessionStatus === "stopped" && Boolean(thread.lastError?.trim());
}

/**
 * Map session lifecycle → BacksterOS status and PATCH when it changes.
 * `in_review` is only applied when the live task is already `in_progress`
 * (enforced inside {@link patchBacksterosControlTaskStatus}).
 *
 * Control-only sessions usually finish turns as `idle` (not settled `done`);
 * after a working stretch, idle also promotes to `in_review` — unless the
 * live session errored or stopped with `lastError`.
 */
export function maybePromoteBacksterosTaskForControlSession(
  taskId: string,
  sessionStatus: BacksterosControlSessionStatus,
  thread?: ControlSessionPromoteThread | null,
): void {
  const previous = lastPromotedStatus.get(taskId);

  let target = backsterosStatusForControlSession(sessionStatus);
  if (
    target == null &&
    sessionStatus === "idle" &&
    (previous === "working" || previous === "blocked")
  ) {
    target = "in_review";
  }
  // Do not record a failed idle/done snapshot. A later healthy `done` from
  // the web UI timer would otherwise hit previous === "done" and skip.
  if (target === "in_review" && controlSessionFailedToComplete(thread)) {
    return;
  }

  if (previous === sessionStatus) return;
  lastPromotedStatus.set(taskId, sessionStatus);

  // Fresh work cancels any pending idle promote.
  if (sessionStatus === "working" || sessionStatus === "blocked") {
    cancelIdlePromoteForTask(taskId);
  }

  if (!target) return;
  void patchBacksterosControlTaskStatus(taskId, target);
}

export type ScheduleControlSessionPromoteOptions = {
  /**
   * When the grace timer fires, return false to skip promote (session not idle).
   * Defaults to true (timer alone means idle).
   */
  readonly isIdle?: () => boolean;
};

/**
 * After a provider turn completes successfully on a bound thread, promote to
 * `in_review` (debounced). No-op when the thread has no binding (pure web thread
 * without a BacksterOS task link never enters this path). Callers must only
 * invoke this for successful `turn.completed` (not interrupted/failed/aborted).
 */
export function scheduleControlSessionPromoteAfterTurn(
  stateDir: string,
  threadId: string,
  options?: ScheduleControlSessionPromoteOptions,
): void {
  const found = findBacksterosTaskThreadBinding(stateDir, { threadId });
  if (!found) return;

  cancelIdlePromoteForTask(found.taskId);

  // Mark that we saw work so a later idle snapshot still promotes.
  const previous = lastPromotedStatus.get(found.taskId);
  if (previous !== "working" && previous !== "blocked" && previous !== "done") {
    lastPromotedStatus.set(found.taskId, "working");
  }

  const generation = idlePromoteGenerations.get(found.taskId) ?? 0;
  idlePromoteTimers.set(
    found.taskId,
    setTimeout(() => {
      idlePromoteTimers.delete(found.taskId);
      if ((idlePromoteGenerations.get(found.taskId) ?? 0) !== generation) {
        return;
      }
      if (options?.isIdle && !options.isIdle()) {
        return;
      }
      maybePromoteBacksterosTaskForControlSession(found.taskId, "done");
    }, CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS),
  );
}
