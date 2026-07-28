/**
 * Smooth keyboard panel nudging: accumulate a target and ease the visible
 * width toward it on rAF. Holding ⌥-/⌥= keeps the target moving so the
 * animation never "finishes then restarts" between key-repeats.
 *
 * Prefer applying width imperatively in `setWidth` (DOM style + ref) and only
 * committing React state from `onSettle`, so 60fps chase does not re-render
 * the whole task/agent tree.
 */
export type PanelWidthNudger = {
  nudge: (delta: number) => boolean;
  /** Jump the live width (e.g. drag / project change) and cancel any chase. */
  sync: (width: number) => void;
  cancel: () => void;
  /** True while a chase frame is scheduled. */
  isAnimating: () => boolean;
};

export function createPanelWidthNudger({
  getWidth,
  setWidth,
  clampWidth,
  onSettle,
  /** Per-frame blend toward target (0–1). Higher = snappier. */
  ease = 0.18,
  /** Stop when within this many px of the target. */
  settleEpsilon = 0.6,
}: {
  getWidth: () => number;
  setWidth: (width: number) => void;
  clampWidth: (width: number) => number;
  onSettle?: (width: number) => void;
  ease?: number;
  settleEpsilon?: number;
}): PanelWidthNudger {
  let target = getWidth();
  let rafId: number | null = null;

  const stop = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const tick = () => {
    const current = getWidth();
    const delta = target - current;
    if (Math.abs(delta) <= settleEpsilon) {
      setWidth(target);
      rafId = null;
      onSettle?.(target);
      return;
    }
    setWidth(current + delta * ease);
    rafId = requestAnimationFrame(tick);
  };

  return {
    nudge(delta: number) {
      const nextTarget = clampWidth(target + delta);
      if (
        nextTarget === target &&
        Math.abs(getWidth() - target) <= settleEpsilon
      ) {
        return false;
      }
      target = nextTarget;
      if (rafId == null) {
        rafId = requestAnimationFrame(tick);
      }
      return true;
    },
    sync(width: number) {
      stop();
      target = width;
    },
    cancel: stop,
    isAnimating: () => rafId != null,
  };
}
