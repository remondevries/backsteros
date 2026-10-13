/**
 * Shared geometry for infinite calendar strips (week horizontal / month vertical).
 * Recycle only near the edges; panes are keyed by date so the visible instance
 * survives and only off-screen panes mount/unmount.
 */

export function calendarStripCenterIndex(paneCount: number): number {
  return Math.floor((paneCount - 1) / 2);
}

/**
 * When the viewport sits on (or past) an edge pane, return how far to shift the
 * anchor so that pane becomes the center. `0` means stay put.
 */
export function calendarStripRecycleShift(options: {
  scrollOffset: number;
  paneSize: number;
  paneCount: number;
  /** How many outer panes count as "edge" (1 = only the outermost). */
  edgeBuffer?: number;
  edgeTolerancePx?: number;
}): number {
  const paneSize = Math.max(1, options.paneSize);
  const paneCount = Math.max(1, options.paneCount);
  const center = calendarStripCenterIndex(paneCount);
  const edgeBuffer = Math.max(0, options.edgeBuffer ?? 1);
  const tolerance = options.edgeTolerancePx ?? 2;
  const maxScroll = paneSize * (paneCount - 1);
  const offset = options.scrollOffset;

  if (offset <= tolerance) {
    return -center;
  }
  if (offset >= maxScroll - tolerance) {
    return paneCount - 1 - center;
  }

  // Proactive recycle while a buffer pane is still on-screen, so the new edge
  // FullCalendar mounts off-screen before the user arrives.
  const index = Math.round(offset / paneSize);
  if (index <= edgeBuffer - 1) {
    return index - center;
  }
  if (index >= paneCount - edgeBuffer) {
    return index - center;
  }
  return 0;
}

export function calendarStripCenterScrollOffset(
  paneSize: number,
  paneCount: number,
): number {
  return Math.max(1, paneSize) * calendarStripCenterIndex(paneCount);
}
