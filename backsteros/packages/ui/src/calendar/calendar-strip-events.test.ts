import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TaskCalendarEvent } from "./calendar-events.js";
import { filterCalendarEventsOverlappingRange } from "./calendar-strip-events.js";

function timed(
  id: string,
  start: string,
  end: string,
): TaskCalendarEvent {
  return {
    id,
    title: id,
    start,
    end,
    allDay: false,
    classNames: [],
    extendedProps: {
      entityType: "meeting",
      meetingId: id,
    },
  };
}

function allDay(id: string, start: string, end?: string): TaskCalendarEvent {
  return {
    id,
    title: id,
    start,
    end,
    allDay: true,
    classNames: [],
    extendedProps: {
      entityType: "task",
      taskId: id,
      status: "ready_to_start",
    },
  };
}

describe("filterCalendarEventsOverlappingRange", () => {
  it("keeps timed events that overlap the window", () => {
    const rangeStart = new Date(2026, 8, 14); // Mon
    const rangeEnd = new Date(2026, 8, 21);
    const events = [
      timed("in", "2026-09-15T10:00:00", "2026-09-15T11:00:00"),
      timed("before", "2026-09-13T10:00:00", "2026-09-13T11:00:00"),
      timed("after", "2026-09-22T10:00:00", "2026-09-22T11:00:00"),
    ];
    const filtered = filterCalendarEventsOverlappingRange(
      events,
      rangeStart,
      rangeEnd,
    );
    assert.deepEqual(
      filtered.map((event) => event.id),
      ["in"],
    );
  });

  it("keeps all-day events on days inside the window", () => {
    const rangeStart = new Date(2026, 8, 14);
    const rangeEnd = new Date(2026, 8, 21);
    const events = [
      allDay("mon", "2026-09-14"),
      allDay("next-mon", "2026-09-21"),
    ];
    const filtered = filterCalendarEventsOverlappingRange(
      events,
      rangeStart,
      rangeEnd,
    );
    assert.deepEqual(
      filtered.map((event) => event.id),
      ["mon"],
    );
  });
});
