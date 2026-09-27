import type { TaskWriteActor } from "../lib/write-actor.js";

/**
 * Status-driven auto time tracking (BDV-44): start when a task enters
 * `in_progress`, pause when it leaves that status.
 */
export function shouldAutoStartTaskTimer(
  fromStatus: string | null | undefined,
  toStatus: string,
): boolean {
  return toStatus === "in_progress" && fromStatus !== "in_progress";
}

export function shouldAutoStopTaskTimer(
  fromStatus: string,
  toStatus: string,
): boolean {
  return fromStatus === "in_progress" && toStatus !== "in_progress";
}

/** Prefer the assignee contact so auto sessions never show as "Agent". */
export function timerActorFromAssignee(
  assigneeId: string | null | undefined,
): TaskWriteActor {
  const contactId = assigneeId?.trim() || null;
  if (contactId) {
    return { userId: null, contactId, kind: "contact" };
  }
  return { userId: null };
}

/**
 * Merge a closed session into the task total without double-counting soft
 * checkpoints that may already have written a running total.
 */
export function nextTrackedDurationAfterAutoStop(input: {
  currentTrackedSeconds: number | null | undefined;
  previousStoppedSecondsSum: number;
  sessionSeconds: number;
}): number {
  const current = Math.max(0, Math.round(input.currentTrackedSeconds ?? 0));
  const previousStops = Math.max(0, Math.round(input.previousStoppedSecondsSum));
  const session = Math.max(0, Math.round(input.sessionSeconds));
  const activityTotal = previousStops + session;
  return Math.max(current, activityTotal);
}
