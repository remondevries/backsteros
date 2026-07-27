/** Observer-side agent → In Review helpers (mirrors agent-hold). */

import { migrateLegacyTaskStatus, type TaskStatus } from "@backsteros/ui";

const MAX_COMMENT_CHARS = 3_500;

const REVIEWABLE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "in_progress",
  "ready_to_start",
  // Hold → reply → finish should still reach In Review even if the In Progress
  // PATCH lagged behind turn completion.
  "on_hold",
  // Already in review: later successful turns still post a new comment.
  "in_review",
]);

function truncateComment(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_COMMENT_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_COMMENT_CHARS - 1).trimEnd()}…`;
}

/** Comment body for In Review — the agent message only (no stock prefix). */
export function formatAgentReviewComment(
  detail: string | null | undefined,
): string {
  return detail?.trim() ? truncateComment(detail) : "";
}

/** True when the observer may move this status to In Review. */
export function canMarkTaskInReview(
  status: string | null | undefined,
): boolean {
  if (!status?.trim()) return false;
  return REVIEWABLE_STATUSES.has(migrateLegacyTaskStatus(status));
}

/**
 * After a completed turn with no hold decision: mark In Review when the task
 * is still actively being worked.
 */
export function evaluateAgentTurnReview(input: {
  taskStatus?: string | null;
  assistantText?: string | null;
}): { commentBody: string } | null {
  if (!canMarkTaskInReview(input.taskStatus)) return null;
  return {
    commentBody: formatAgentReviewComment(input.assistantText),
  };
}
