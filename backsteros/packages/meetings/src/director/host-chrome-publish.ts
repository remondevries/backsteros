/**
 * Policy for Director → shell host-chrome publishing.
 *
 * `hostChromeSlots` is a new object identity whenever media/device/theme deps
 * change. React runs layout-effect cleanup before the next effect body.
 *
 * Buggy policy (pre-fix): one effect depended on `hostChromeSlots` and cleared
 * to `null` in cleanup. Every slots rebuild did:
 *   onHostChromeChange(null) → MeetingRoomSession setHostChrome(null)
 *   → breadcrumb unregisters → onHostChromeChange(slots) → re-register
 * inside the Start-room click microtask/layout drain (prod WebContent stuck in
 * MouseEvent → Microtask → layout for minutes).
 *
 * Fixed policy: publish on slots change; clear only on genuine host teardown
 * (unmount / `onHostChromeChange` identity leaving).
 */

export type HostChromePublishOp = "clear" | "publish";

/**
 * Whether layout-effect cleanup may call `onHostChromeChange(null)`.
 * `slotsIdentityChanged` alone must never clear.
 */
export function shouldClearHostChromeOnLayoutCleanup(input: {
  slotsIdentityChanged: boolean;
  hostCallbackTeardown: boolean;
}): boolean {
  void input.slotsIdentityChanged;
  return input.hostCallbackTeardown;
}

/**
 * Ops emitted when slots identity changes under a given clear policy.
 * Models the React cleanup→effect sequence for one transition.
 */
export function hostChromeOpsForSlotsTransition(input: {
  hadPreviousSlots: boolean;
  clearOnSlotsChange: boolean;
}): HostChromePublishOp[] {
  const ops: HostChromePublishOp[] = [];
  if (input.clearOnSlotsChange && input.hadPreviousSlots) {
    ops.push("clear");
  }
  ops.push("publish");
  return ops;
}

/** Count clears/publishes across N slots rebuilds (mount + N-1 updates). */
export function countHostChromeOpsAcrossSlotRebuilds(input: {
  slotRebuilds: number;
  clearOnSlotsChange: boolean;
}): { clears: number; publishes: number } {
  let clears = 0;
  let publishes = 0;
  for (let i = 0; i < input.slotRebuilds; i += 1) {
    const ops = hostChromeOpsForSlotsTransition({
      hadPreviousSlots: i > 0,
      clearOnSlotsChange: input.clearOnSlotsChange,
    });
    for (const op of ops) {
      if (op === "clear") clears += 1;
      else publishes += 1;
    }
  }
  return { clears, publishes };
}
