/**
 * Horizontal trackpad / shift+wheel pan → day steps for week (and day) views.
 * FullCalendar has no infinite horizontal strip; this slides the visible window
 * by whole days once accumulated delta crosses a threshold.
 */

export type CalendarHorizontalDatePanState = {
  accumulatedPx: number;
};

export const CALENDAR_HORIZONTAL_DATE_PAN_THRESHOLD_PX = 64;

/** Keep claiming horizontal pans briefly so aggressive trackpad diagonals don't leak. */
export const CALENDAR_HORIZONTAL_DATE_PAN_LOCK_MS = 180;

export function createCalendarHorizontalDatePanState(): CalendarHorizontalDatePanState {
  return { accumulatedPx: 0 };
}

/**
 * Resolve a wheel event into a day delta for calendar date panning.
 * Returns `null` when the gesture is primarily vertical (leave time-grid scroll alone).
 */
export function resolveCalendarHorizontalPanWheel(
  input: {
    deltaX: number;
    deltaY: number;
    shiftKey: boolean;
  },
  options?: { locked?: boolean },
): { deltaPx: number } | null {
  const absX = Math.abs(input.deltaX);
  const absY = Math.abs(input.deltaY);

  // Shift+vertical mouse wheel → horizontal pan (common desktop convention).
  if (input.shiftKey && absY >= absX) {
    return { deltaPx: input.deltaY };
  }

  if (options?.locked) {
    // Stay on the horizontal axis until the lock times out.
    if (absX < 0.5) return null;
    return { deltaPx: input.deltaX };
  }

  // Trackpad: claim clearly-horizontal (or near-horizontal) gestures.
  if (absX < 1.5) return null;
  if (absX < absY * 0.75) return null;
  return { deltaPx: input.deltaX };
}

/**
 * True when this wheel event carries enough horizontal intent that the page
 * must not rubber-band / scroll — even if we have not yet stepped a day.
 */
export function shouldPreventCalendarPageHorizontalScroll(input: {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  locked?: boolean;
}): boolean {
  if (input.shiftKey) return true;
  if (input.locked) return Math.abs(input.deltaX) >= 0.5;
  return resolveCalendarHorizontalPanWheel(input) != null;
}

/**
 * Accumulate pan pixels into whole-day steps.
 * Positive delta → later days (scroll / content moves toward earlier → future).
 */
export function accumulateCalendarHorizontalDatePan(
  state: CalendarHorizontalDatePanState,
  deltaPx: number,
  options?: { thresholdPx?: number },
): {
  nextState: CalendarHorizontalDatePanState;
  dayDelta: number;
} {
  const threshold = Math.max(
    1,
    options?.thresholdPx ?? CALENDAR_HORIZONTAL_DATE_PAN_THRESHOLD_PX,
  );
  let accumulated = state.accumulatedPx + deltaPx;
  let dayDelta = 0;

  while (accumulated >= threshold) {
    dayDelta += 1;
    accumulated -= threshold;
  }
  while (accumulated <= -threshold) {
    dayDelta -= 1;
    accumulated += threshold;
  }

  return {
    nextState: { accumulatedPx: accumulated },
    dayDelta,
  };
}
