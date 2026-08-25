import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarChangeToWeekdayHoursPatch,
  calendarSelectionToWeekdayHoursPatch,
  isMeetingsAvailabilityGridView,
  weekdayHoursToCalendarEvents,
  weekdayHoursToMeetingAvailabilityMarkers,
} from "./calendar-availability-events.js";
import { patchWeekdayHoursEntry } from "./calendar-availability-slots.js";

const weekdayHours = [
  {
    weekday: 1,
    enabled: true,
    slots: [{ start: "09:00", end: "10:00" }],
  },
  { weekday: 2, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
  { weekday: 3, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
  { weekday: 4, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
  { weekday: 5, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
  { weekday: 6, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
  { weekday: 7, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
];

test("weekdayHoursToCalendarEvents emits one block per enabled day in range", () => {
  const events = weekdayHoursToCalendarEvents({
    weekdayHours,
    timezone: "Europe/Amsterdam",
    rangeStart: new Date("2026-08-24T00:00:00.000Z"),
    rangeEnd: new Date("2026-08-31T00:00:00.000Z"),
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.extendedProps.weekday, 1);
});

test("weekdayHoursToCalendarEvents month presentation uses all-day blocks", () => {
  const events = weekdayHoursToCalendarEvents({
    weekdayHours,
    timezone: "Europe/Amsterdam",
    rangeStart: new Date("2026-08-24T00:00:00.000Z"),
    rangeEnd: new Date("2026-08-31T00:00:00.000Z"),
    presentation: "month",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.allDay, true);
  assert.equal(events[0]?.start, "2026-08-24");
  assert.equal(events[0]?.title, "9:00am – 10:00am");
});

test("calendarChangeToWeekdayHoursPatch updates weekday times", () => {
  const start = new Date("2026-08-24T07:00:00.000Z");
  const end = new Date("2026-08-24T10:00:00.000Z");
  const patched = calendarChangeToWeekdayHoursPatch({
    weekday: 1,
    start,
    end,
    timezone: "Europe/Amsterdam",
    weekdayHours,
  });
  assert.ok(patched);
  assert.equal(patched[0]?.slots[0]?.start, "09:00");
  assert.equal(patched[0]?.slots[0]?.end, "12:00");
});

test("calendarSelectionToWeekdayHoursPatch appends a slot on enabled days", () => {
  const start = new Date("2026-08-24T12:00:00.000Z");
  const end = new Date("2026-08-24T14:00:00.000Z");
  const patched = calendarSelectionToWeekdayHoursPatch({
    start,
    end,
    timezone: "Europe/Amsterdam",
    weekdayHours,
  });
  assert.ok(patched);
  assert.equal(patched[0]?.slots.length, 2);
  assert.equal(patched[0]?.slots[1]?.start, "14:00");
  assert.equal(patched[0]?.slots[1]?.end, "16:00");
});

test("calendarSelectionToWeekdayHoursPatch enables disabled days with one slot", () => {
  const start = new Date("2026-08-25T07:00:00.000Z");
  const end = new Date("2026-08-25T10:00:00.000Z");
  const patched = calendarSelectionToWeekdayHoursPatch({
    start,
    end,
    timezone: "Europe/Amsterdam",
    weekdayHours,
  });
  assert.ok(patched);
  assert.equal(patched[1]?.enabled, true);
  assert.deepEqual(patched[1]?.slots, [{ start: "09:00", end: "12:00" }]);
});

test("patchWeekdayHoursEntry enables a weekday when saving non-empty slots", () => {
  const patched = patchWeekdayHoursEntry(weekdayHours, 7, {
    slots: [{ start: "18:00", end: "21:00" }],
  });
  assert.equal(patched[6]?.enabled, true);
  assert.deepEqual(patched[6]?.slots, [{ start: "18:00", end: "21:00" }]);
});

test("patchWeekdayHoursEntry respects an explicit enabled flag", () => {
  const patched = patchWeekdayHoursEntry(weekdayHours, 1, {
    enabled: false,
    slots: [{ start: "09:00", end: "12:00" }],
  });
  assert.equal(patched[0]?.enabled, false);
});

test("weekdayHoursToMeetingAvailabilityMarkers emits slots for a single day range", () => {
  const markers = weekdayHoursToMeetingAvailabilityMarkers({
    weekdayHours,
    timezone: "Europe/Amsterdam",
    rangeStart: new Date("2026-08-24T00:00:00.000Z"),
    rangeEnd: new Date("2026-08-25T00:00:00.000Z"),
  });
  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.display, "background");
  assert.equal(markers[0]?.backgroundColor, "transparent");
  assert.deepEqual(markers[0]?.classNames, ["calendar-meetings-availability-marker"]);
});

test("isMeetingsAvailabilityGridView includes week and day time grids", () => {
  assert.equal(isMeetingsAvailabilityGridView("timeGridWeek"), true);
  assert.equal(isMeetingsAvailabilityGridView("timeGridDay"), true);
  assert.equal(isMeetingsAvailabilityGridView("dayGridMonth"), false);
});
