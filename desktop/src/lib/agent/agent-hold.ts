/** Conservative agent → On Hold policy helpers (observer-side, not agent-posted). */

import {
  AGENT_HOLD_COMMENT_PREFIXES,
  isAgentHoldCommentBody,
} from "@backsteros/ui";

export { AGENT_HOLD_COMMENT_PREFIXES, isAgentHoldCommentBody };

export type AgentHoldKind = "launch_failed" | "turn_failed" | "needs_input";

export type AgentHoldDecision = {
  kind: AgentHoldKind;
  /** Full comment body to post as Agent. */
  commentBody: string;
};

const MAX_COMMENT_CHARS = 3_500;

const NEEDS_INPUT_PATTERNS: RegExp[] = [
  /\bI need (more )?(info|information|clarification|details|context)\b/i,
  /\bcould you (please )?(clarify|confirm|provide|tell|share)\b/i,
  /\bplease (clarify|confirm|provide|tell me|let me know)\b/i,
  /\bI('m| am) (blocked|stuck|unable to)\b/i,
  /\b(cannot|can't|unable to) (proceed|continue|complete|access|find)\b/i,
  /\bnot enough (info|information|context)\b/i,
  /\bwaiting (on|for) (you|your|clarification|input|approval)\b/i,
  /\bwhich (option|approach|one) (should|do) (I|we)\b/i,
  /\b(before I (can )?continue|so I can (continue|proceed))\b/i,
  /\b(do you want me to|should I|would you like me to)\b/i,
];

const SOFT_ASK_PATTERNS: RegExp[] = [
  /\b(should I|do you want|can you|would you|let me know|please confirm)\b/i,
];

function truncateComment(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_COMMENT_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_COMMENT_CHARS - 1).trimEnd()}…`;
}

export function isFailedTurnStatus(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  const value = status.trim().toLowerCase();
  // Cursor `stop` hook: completed | aborted | error
  if (value === "completed" || value === "complete") return false;
  if (value === "error" || value === "aborted" || value === "abort") return true;
  if (/^(ok|success|succeeded|done|idle)$/.test(value)) {
    return false;
  }
  return /\b(fail|failed|failure|error|aborted|abort|cancelled|canceled|denied)\b/.test(
    value,
  );
}

/**
 * Conservative: only treat assistant text as "needs input" when it clearly
 * asks/blocked — not every mid-work status update.
 */
export function detectNeedsInputFromAssistantText(
  text: string | null | undefined,
): boolean {
  if (!text?.trim()) return false;
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;

  const tail = trimmed.slice(-1_200);
  if (NEEDS_INPUT_PATTERNS.some((pattern) => pattern.test(tail))) {
    return true;
  }

  const lines = tail
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? "";
  const endsWithQuestion = /\?\s*$/.test(lastLine) && lastLine.length < 280;
  if (!endsWithQuestion) return false;
  return SOFT_ASK_PATTERNS.some((pattern) => pattern.test(tail));
}

export function formatAgentHoldComment(
  kind: AgentHoldKind,
  detail: string | null | undefined,
): string {
  const prefix =
    kind === "launch_failed"
      ? "Agent could not start."
      : kind === "turn_failed"
        ? "Agent failed to complete this task."
        : "Agent needs input before it can continue.";
  const body = detail?.trim() ? truncateComment(detail) : "";
  return body ? `${prefix}\n\n${body}` : prefix;
}

/** Decide whether a completed agent turn should move the task to On Hold. */
export function evaluateAgentTurnHold(input: {
  status?: string | null;
  assistantText?: string | null;
}): AgentHoldDecision | null {
  if (isFailedTurnStatus(input.status)) {
    return {
      kind: "turn_failed",
      commentBody: formatAgentHoldComment(
        "turn_failed",
        input.assistantText?.trim() ||
          `Turn ended with status: ${input.status?.trim()}`,
      ),
    };
  }
  if (detectNeedsInputFromAssistantText(input.assistantText)) {
    return {
      kind: "needs_input",
      commentBody: formatAgentHoldComment(
        "needs_input",
        input.assistantText,
      ),
    };
  }
  return null;
}

export const AGENT_SESSION_ENDED_HOLD_DETAIL =
  "Agent session ended before the turn finished." as const;

/**
 * Observer outcome after a turn ends: hold (fail / needs-input / abrupt exit)
 * or review (successful stop/fallback).
 */
export function evaluateAgentTurnOutcome(input: {
  reason: "stop" | "sessionEnd" | "fallback";
  status?: string | null;
  assistantText?: string | null;
  /** sessionEnd while a turn was still armed / working. */
  abrupt?: boolean;
}):
  | { action: "hold"; decision: AgentHoldDecision }
  | { action: "review" } {
  const hold = evaluateAgentTurnHold({
    status: input.status,
    assistantText: input.assistantText,
  });
  if (hold) {
    return { action: "hold", decision: hold };
  }
  if (input.reason === "sessionEnd" && input.abrupt) {
    return {
      action: "hold",
      decision: {
        kind: "turn_failed",
        commentBody: formatAgentHoldComment(
          "turn_failed",
          AGENT_SESSION_ENDED_HOLD_DETAIL,
        ),
      },
    };
  }
  return { action: "review" };
}

export function buildLaunchFailedHold(
  error: string | null | undefined,
): AgentHoldDecision {
  return {
    kind: "launch_failed",
    commentBody: formatAgentHoldComment("launch_failed", error),
  };
}
