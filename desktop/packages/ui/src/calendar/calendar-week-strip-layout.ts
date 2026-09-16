/** Keep header + all-day lanes the same height across strip panes (stops vertical jump while panning). */

const MIN_ALL_DAY_HEIGHT_PX = 44;

function collectTimegridSectionScrollers(
  strip: HTMLElement,
  paneAttr: string,
): { headers: HTMLElement[]; allDays: HTMLElement[] } {
  const panes = [...strip.querySelectorAll<HTMLElement>(`[${paneAttr}]`)];
  const headers: HTMLElement[] = [];
  const allDays: HTMLElement[] = [];

  for (const pane of panes) {
    const scrollers = [
      ...pane.querySelectorAll<HTMLElement>(".fc-timegrid .fc-scroller"),
    ].filter((el) => !el.classList.contains("fc-scroller-liquid-absolute"));
    // Header scroller is first; all-day scroller is second.
    if (scrollers[0]) headers.push(scrollers[0]);
    if (scrollers[1]) allDays.push(scrollers[1]);
  }

  return { headers, allDays };
}

function syncEqualScrollerHeights(
  scrollers: HTMLElement[],
  minHeightPx: number,
): number {
  for (const scroller of scrollers) {
    scroller.style.removeProperty("height");
    scroller.style.removeProperty("min-height");
  }

  let max = 0;
  for (const scroller of scrollers) {
    max = Math.max(max, scroller.getBoundingClientRect().height);
  }
  const height = Math.max(Math.ceil(max), minHeightPx);

  // Use setProperty with !important so FullCalendar's own post-render layout
  // pass cannot override the value on empty-content panes.
  for (const scroller of scrollers) {
    scroller.style.setProperty("height", `${height}px`, "important");
    scroller.style.setProperty("min-height", `${height}px`, "important");
  }
  return height;
}

/**
 * Equalize day-header and all-day lane heights across week/day strip panes.
 * Returns the applied all-day height (callers that only need that keep working).
 */
export function syncCalendarWeekStripAllDayHeights(
  strip: HTMLElement,
  paneAttr: string = "data-week-pane",
): number {
  const { headers, allDays } = collectTimegridSectionScrollers(strip, paneAttr);

  // Header height comes from CSS `--calendar-col-header-height`; still equalize
  // measured scrollers so a pane mid-habit-mount cannot stair-step neighbors.
  if (headers.length > 0) {
    const cssHeader = Number.parseFloat(
      getComputedStyle(strip).getPropertyValue("--calendar-col-header-height"),
    );
    const minHeader = Number.isFinite(cssHeader) && cssHeader > 0 ? cssHeader : 0;
    syncEqualScrollerHeights(headers, minHeader);
  }

  if (allDays.length === 0) return MIN_ALL_DAY_HEIGHT_PX;
  return syncEqualScrollerHeights(allDays, MIN_ALL_DAY_HEIGHT_PX);
}
