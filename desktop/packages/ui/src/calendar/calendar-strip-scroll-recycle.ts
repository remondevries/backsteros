import {
  calendarStripCenterScrollOffset,
  calendarStripRecycleShift,
} from "./calendar-strip-geometry.js";

/**
 * Infinite calendar strip recycle that keeps the gesture path free:
 * - Scroll offset updates always apply (never drop wheel deltas).
 * - Anchor shifts are scheduled on rAF so React remounts run after the frame’s
 *   scroll paint — same idea as Linear’s “network/sync off the interaction path.”
 * - A short cooldown prevents nested recycles; pending scroll after unlock is
 *   re-checked so fast pans don’t stall at the edge.
 */
export function createCalendarStripRecycleController(options: {
  getPaneSize: () => number;
  getScrollOffset: () => number;
  setScrollOffset: (value: number) => void;
  paneCount: number;
  edgeBuffer?: number;
  onShift: (shift: number) => void;
  /** After a shift, ignore further recycles this long (ms). */
  cooldownMs?: number;
}): {
  /** Call after the scroll offset changes (wheel or native scroll). */
  afterScroll: () => void;
  isRecycling: () => boolean;
  dispose: () => void;
} {
  const edgeBuffer = options.edgeBuffer ?? 1;
  const cooldownMs = options.cooldownMs ?? 80;

  let recycling = false;
  let checkRaf: number | null = null;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  function runRecycleIfNeeded() {
    if (recycling) return;
    const paneSize = options.getPaneSize();
    if (paneSize <= 0) return;
    const shift = calendarStripRecycleShift({
      scrollOffset: options.getScrollOffset(),
      paneSize,
      paneCount: options.paneCount,
      edgeBuffer,
    });
    if (shift === 0) return;

    recycling = true;
    // Snap first so the visible pane stays under the viewport while React
    // re-keys neighbors off-screen.
    options.setScrollOffset(
      calendarStripCenterScrollOffset(paneSize, options.paneCount),
    );
    options.onShift(shift);

    cooldownTimer = setTimeout(() => {
      cooldownTimer = null;
      recycling = false;
      // Fast pans may already sit on a new edge — recycle again without
      // waiting for another wheel tick.
      scheduleCheck();
    }, cooldownMs);
  }

  function scheduleCheck() {
    if (checkRaf != null) return;
    checkRaf = requestAnimationFrame(() => {
      checkRaf = null;
      runRecycleIfNeeded();
    });
  }

  return {
    afterScroll: scheduleCheck,
    isRecycling: () => recycling,
    dispose: () => {
      if (checkRaf != null) {
        cancelAnimationFrame(checkRaf);
        checkRaf = null;
      }
      if (cooldownTimer != null) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
      recycling = false;
    },
  };
}
