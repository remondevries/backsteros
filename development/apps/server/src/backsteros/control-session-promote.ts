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

/** Debounce ready→in_review so brief session gaps do not flip status (mirrors web OS-15). */
export const CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS = 5_000;

export function resetControlSessionPromoteStateForTests(): void {
  lastPromotedStatus.clear();
  for (const timer of idlePromoteTimers.values()) {
    clearTimeout(timer);
  }
  idlePromoteTimers.clear();
}

/**
 * Map session lifecycle → BacksterOS status and PATCH when it changes.
 * `in_review` is only applied when the live task is already `in_progress`
 * (enforced inside {@link patchBacksterosControlTaskStatus}).
 *
 * Control-only sessions usually finish turns as `idle` (not settled `done`);
 * after a working stretch, idle also promotes to `in_review`.
 */
export function maybePromoteBacksterosTaskForControlSession(
  taskId: string,
  sessionStatus: BacksterosControlSessionStatus,
): void {
  const previous = lastPromotedStatus.get(taskId);
  if (previous === sessionStatus) return;
  lastPromotedStatus.set(taskId, sessionStatus);

  let target = backsterosStatusForControlSession(sessionStatus);
  if (
    target == null &&
    sessionStatus === "idle" &&
    (previous === "working" || previous === "blocked")
  ) {
    target = "in_review";
  }
  if (!target) return;
  void patchBacksterosControlTaskStatus(taskId, target);
}

/**
 * After a provider turn completes on a control-bound thread, promote to
 * `in_review` (debounced). No-op when the thread is not control-bound.
 */
export function scheduleControlSessionPromoteAfterTurn(stateDir: string, threadId: string): void {
  const found = findBacksterosTaskThreadBinding(stateDir, { threadId });
  if (!found) return;

  const existing = idlePromoteTimers.get(found.taskId);
  if (existing) clearTimeout(existing);

  // Mark that we saw work so a later idle snapshot still promotes.
  const previous = lastPromotedStatus.get(found.taskId);
  if (previous !== "working" && previous !== "blocked" && previous !== "done") {
    lastPromotedStatus.set(found.taskId, "working");
  }

  idlePromoteTimers.set(
    found.taskId,
    setTimeout(() => {
      idlePromoteTimers.delete(found.taskId);
      maybePromoteBacksterosTaskForControlSession(found.taskId, "done");
    }, CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS),
  );
}
