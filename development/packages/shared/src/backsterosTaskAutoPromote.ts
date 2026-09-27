/**
 * Shared rules for agent-driven BacksterOS task status auto-promote.
 * Used by Development web turn-start / leave-timer writes and the localhost
 * control API session start. The control status GET is read-only (OS-38) and
 * never writes task status.
 */

export type BacksterosControlSessionStatus = "idle" | "working" | "blocked" | "done";

/**
 * Map control / session lifecycle → the BacksterOS task status it implies.
 * Only a real `done` (turn settled after work) maps to `in_review` — bare `idle`
 * never does. Pure mapping; status polls must not act on it (OS-38).
 */
export function backsterosStatusForControlSession(
  sessionStatus: BacksterosControlSessionStatus,
): "in_progress" | "in_review" | null {
  if (sessionStatus === "working" || sessionStatus === "blocked") {
    return "in_progress";
  }
  if (sessionStatus === "done") {
    return "in_review";
  }
  return null;
}

const CLOSED_FOR_AUTO_PROMOTE = new Set(["completed", "canceled", "duplicated", "done"]);

/**
 * Whether agent lifecycle may auto-move this task (to in_progress / in_review).
 * Closed outcomes stay put — a leave timer or control poll must not reopen them.
 */
export function canAutoPromoteBacksterosTaskStatus(status: string): boolean {
  return !CLOSED_FOR_AUTO_PROMOTE.has(status);
}
