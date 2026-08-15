/**
 * Steer-first mid-turn policy (T3-aligned, no visible follow-up queue).
 *
 * Failed steers stay user-driven (Retry / Discard). Settling a turn must never
 * auto-send a deferred prompt that was meant as a steer.
 */

export type SteerSettleFlushDecisionInput = {
  /** Turn sealed as interrupted (Stop). */
  interrupted: boolean;
  /** Unresolved failed-steer draft above the composer. */
  hasFailedSteer: boolean;
};

/**
 * Whether Chat should automatically dispatch a deferred prompt after settle.
 * Always false under steer-first — there is no post-settle flush queue.
 */
export function shouldAutoFlushAfterSettle(
  _input: SteerSettleFlushDecisionInput,
): boolean {
  return false;
}
