/** Minimal shape shared by task/meeting events and availability markers. */
export type CalendarStripFilterableEvent = {
  start: string;
  end?: string;
  /** Absent (e.g. timed availability markers) is treated as timed. */
  allDay?: boolean;
};

function eventStartMs(event: CalendarStripFilterableEvent): number {
  const raw = event.start;
  if (!raw) return Number.NaN;
  // All-day: local YYYY-MM-DD → start of that local day.
  if (event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function eventEndMs(event: CalendarStripFilterableEvent, startMs: number): number {
  const raw = event.end;
  if (raw) {
    if (event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      // FullCalendar all-day end is exclusive; treat as start-of-day.
      return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
    }
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  // Timed with no end → point event; all-day with no end → one local day.
  if (event.allDay) {
    return startMs + 24 * 60 * 60 * 1000;
  }
  return startMs + 1;
}

/**
 * Keep only events that overlap `[rangeStart, rangeEnd)` so each strip pane’s
 * FullCalendar does not index the whole workspace on every paint.
 */
export function filterCalendarEventsOverlappingRange<
  T extends CalendarStripFilterableEvent,
>(events: readonly T[], rangeStart: Date, rangeEnd: Date): T[] {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  if (!(endMs > startMs) || events.length === 0) return [];

  const out: T[] = [];
  for (const event of events) {
    const eventStart = eventStartMs(event);
    if (!Number.isFinite(eventStart)) continue;
    const eventEnd = eventEndMs(event, eventStart);
    if (eventStart < endMs && eventEnd > startMs) {
      out.push(event);
    }
  }
  return out;
}
