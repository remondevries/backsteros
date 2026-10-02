/**
 * Shared rules for agent-driven BacksterOS task status auto-promote.
 * Used by Development web turn-start / leave-timer writes, control session
 * start, and explicit POST promote when the web UI is closed.
 * Control status / session-list GETs stay read-only (OS-38).
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
