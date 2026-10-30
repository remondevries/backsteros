/**
 * Client-side “Sander is thinking…” / step-label state for shell agent DMs.
 * Durable thinking comes from agent status SSE (`working` / `idle`);
 * after Remon sends we only show a short provisional wait.
 */

/** Show thinking at most this long after Remon sends if no `working` signal. */
export const CHAT_THINKING_PROVISIONAL_MS = 90_000;

/** Clear thinking if last `working` status is older than this. */
export const CHAT_THINKING_WORKING_STALE_MS = 120_000;

export type ChatThinkingMode = "off" | "provisional" | "working";

export type ChatThinkingState = {
  mode: ChatThinkingMode;
  /** Epoch ms when this mode should clear if no further signal. */
  expiresAt: number | null;
  /**
   * Optional step label from `POST …/status` while working.
   * Shown instead of “Thinking…” when non-empty; cleared on idle/reply.
   */
  label: string | null;
};

export const CHAT_THINKING_OFF: ChatThinkingState = {
  mode: "off",
  expiresAt: null,
  label: null,
};

export function chatThinkingIsActive(
  state: ChatThinkingState,
  nowMs: number,
): boolean {
  if (state.mode === "off") return false;
  if (state.expiresAt == null) return true;
  return nowMs < state.expiresAt;
}

/** After Remon's message is accepted by the agent webhook. */
export function chatThinkingAfterSend(nowMs: number): ChatThinkingState {
  return {
    mode: "provisional",
    expiresAt: nowMs + CHAT_THINKING_PROVISIONAL_MS,
    label: null,
  };
}

/** Agent status API / SSE (`working` | `idle`), or implicit idle on reply. */
export function chatThinkingAfterStatus(
  state: "working" | "idle",
  nowMs: number,
  label: string | null = null,
): ChatThinkingState {
  if (state === "idle") return CHAT_THINKING_OFF;
  const trimmed = label?.trim() || null;
  return {
    mode: "working",
    expiresAt: nowMs + CHAT_THINKING_WORKING_STALE_MS,
    label: trimmed,
  };
}

/**
 * Hydrate from thread.pendingReplyAt (set only while agent reports working).
 * Stale values are ignored. Preserves a prior step label across refetches.
 */
export function chatThinkingFromPendingReplyAt(
  pendingReplyAt: string | null | undefined,
  nowMs: number,
  previousLabel: string | null = null,
): ChatThinkingState {
  const raw = pendingReplyAt?.trim() || "";
  if (!raw) return CHAT_THINKING_OFF;
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return CHAT_THINKING_OFF;
  const expiresAt = at + CHAT_THINKING_WORKING_STALE_MS;
  if (nowMs >= expiresAt) return CHAT_THINKING_OFF;
  return {
    mode: "working",
    expiresAt,
    label: previousLabel?.trim() || null,
  };
}

/** Remaining ms until expiry, or null when inactive / no timer. */
export function chatThinkingRemainingMs(
  state: ChatThinkingState,
  nowMs: number,
): number | null {
  if (!chatThinkingIsActive(state, nowMs) || state.expiresAt == null) {
    return null;
  }
  return Math.max(0, state.expiresAt - nowMs);
}
