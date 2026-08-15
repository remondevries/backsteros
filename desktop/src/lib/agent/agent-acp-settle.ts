/**
 * T3-style settle gating: Chat finalize follows prompt lifecycle / explicit
 * stop, not transient session-list flicker.
 */

export type AcpSettleSource =
  | "prompt-complete"
  | "prompt-error"
  | "exit"
  | "stop"
  | "idle"
  | "poll-idle"
  | "teardown";

/**
 * Whether a settle signal should finalize the Chat turn.
 *
 * - `poll-idle` never finalizes Chat (list/board marks only).
 * - `teardown` skips finalize while the live socket still marks activity busy
 *   (Start-agent chatId assign must not flush a mid-turn settle).
 * - prompt-complete / stop / idle / exit finalize.
 */
export function shouldFinalizeChatTurn(input: {
  source: AcpSettleSource;
  activityBusy?: boolean;
}): boolean {
  if (input.source === "poll-idle") return false;
  if (input.source === "teardown" && input.activityBusy) return false;
  return true;
}

/**
 * Whether Chat should reopen a sealed live turn from late ACP frames.
 * Only while the session is still busy (activity or poll).
 */
export function shouldReopenLiveTurnFromLateFrame(input: {
  localTurnActive: boolean;
  sessionBusy: boolean;
}): boolean {
  if (input.localTurnActive) return false;
  return input.sessionBusy;
}
