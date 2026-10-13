import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findMeetingClosestToReference,
  groupScheduledMeetingsByPeriod,
  groupScheduledMeetingsByWeek,
  isCurrentMeetingWeekGroup,
  meetingDayGroupLabel,
  meetingMonthGroupLabel,
  meetingScheduleGranularityFromViewMode,
  meetingWeekGroupLabel,
} from "./calendar-meetings-week-groups.js";
import type { MeetingListItem } from "../meetings/meetings.js";

function meeting(
  partial: Pick<MeetingListItem, "id" | "startAt"> &
    Partial<MeetingListItem>,
): MeetingListItem {
  return {
    number: 1,
    title: partial.id,
    endAt: partial.startAt,
    ...partial,
  };
}

test("meetingScheduleGranularityFromViewMode maps calendar views", () => {
  assert.equal(meetingScheduleGranularityFromViewMode("day"), "day");
  assert.equal(meetingScheduleGranularityFromViewMode("month"), "month");
  assert.equal(meetingScheduleGranularityFromViewMode("week"), "week");
  assert.equal(meetingScheduleGranularityFromViewMode("list"), "week");
});

test("meetingWeekGroupLabel uses ISO week numbers", () => {
  // Monday 2026-09-14 → ISO week 38
  const now = new Date(2026, 8, 16, 12, 0, 0);
  assert.equal(meetingWeekGroupLabel("2026-09-14", { now }), "Week 38");
  assert.equal(meetingWeekGroupLabel("2026-09-21", { now }), "Week 39");
  assert.equal(meetingWeekGroupLabel("2026-09-07", { now }), "Week 37");
  assert.equal(meetingWeekGroupLabel("2026-08-31", { now }), "Week 36");
});

test("isCurrentMeetingWeekGroup matches the Monday week containing now", () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  assert.equal(isCurrentMeetingWeekGroup("2026-09-14", { now }), true);
  assert.equal(isCurrentMeetingWeekGroup("2026-09-21", { now }), false);
  assert.equal(isCurrentMeetingWeekGroup("2026-09-07", { now }), false);
});

test("meetingDayGroupLabel uses relative names for nearby days", () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  assert.equal(meetingDayGroupLabel("2026-09-16", { now }), "Today");
  assert.equal(meetingDayGroupLabel("2026-09-17", { now }), "Tomorrow");
  assert.equal(meetingDayGroupLabel("2026-09-15", { now }), "Yesterday");
  assert.match(meetingDayGroupLabel("2026-09-10", { now }), /Sep/);
});

test("meetingMonthGroupLabel uses relative names for nearby months", () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  assert.equal(meetingMonthGroupLabel("2026-09", { now }), "This month");
  assert.equal(meetingMonthGroupLabel("2026-10", { now }), "Next month");
  assert.equal(meetingMonthGroupLabel("2026-08", { now }), "Last month");
  assert.match(meetingMonthGroupLabel("2026-01", { now }), /January/);
});

test("groupScheduledMeetingsByWeek buckets by Monday week newest-first", () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  const groups = groupScheduledMeetingsByWeek(
    [
      meeting({
        id: "wed",
        number: 2,
        startAt: "2026-09-16T15:00:00",
      }),
      meeting({
        id: "mon-next",
        number: 3,
        startAt: "2026-09-21T09:00:00",
      }),
      meeting({
        id: "tue",
        number: 1,
        startAt: "2026-09-15T10:00:00",
      }),
      meeting({
        id: "last-week",
        number: 4,
        startAt: "2026-09-10T10:00:00",
      }),
    ],
    { now },
  );

  assert.deepEqual(
    groups.map((group) => ({
      weekKey: group.weekKey,
      label: group.label,
      ids: group.meetings.map((entry) => entry.id),
    })),
    [
      {
        weekKey: "2026-09-21",
        label: "Week 39",
        ids: ["mon-next"],
      },
      {
        weekKey: "2026-09-14",
        label: "Week 38",
        ids: ["wed", "tue"],
      },
      {
        weekKey: "2026-09-07",
        label: "Week 37",
        ids: ["last-week"],
      },
    ],
  );
});

test("groupScheduledMeetingsByPeriod groups by day and month newest-first", () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  const meetings = [
    meeting({ id: "aug", number: 1, startAt: "2026-08-25T17:00:00" }),
    meeting({ id: "sep-a", number: 2, startAt: "2026-09-01T17:00:00" }),
    meeting({ id: "sep-b", number: 3, startAt: "2026-09-01T18:00:00" }),
  ];

  const byDay = groupScheduledMeetingsByPeriod(meetings, {
    granularity: "day",
    now,
  });
  assert.deepEqual(
    byDay.map((group) => ({
      groupKey: group.groupKey,
      ids: group.meetings.map((entry) => entry.id),
    })),
    [
      { groupKey: "2026-09-01", ids: ["sep-b", "sep-a"] },
      { groupKey: "2026-08-25", ids: ["aug"] },
    ],
  );

  const byMonth = groupScheduledMeetingsByPeriod(meetings, {
    granularity: "month",
    now,
  });
  assert.deepEqual(
    byMonth.map((group) => ({
      groupKey: group.groupKey,
      label: group.label,
      ids: group.meetings.map((entry) => entry.id),
    })),
    [
      {
        groupKey: "2026-09",
        label: "This month",
        ids: ["sep-b", "sep-a"],
      },
      { groupKey: "2026-08", label: "Last month", ids: ["aug"] },
    ],
  );
});

test("findMeetingClosestToReference prefers today then nearest day", () => {
  const now = new Date(2026, 8, 15, 14, 0, 0); // Tue Sep 15 14:00 local
  const closest = findMeetingClosestToReference(
    [
      meeting({ id: "yesterday", startAt: "2026-09-14T10:00:00" }),
      meeting({ id: "today-morning", startAt: "2026-09-15T09:00:00" }),
      meeting({ id: "today-afternoon", startAt: "2026-09-15T15:00:00" }),
      meeting({ id: "tomorrow", startAt: "2026-09-16T10:00:00" }),
    ],
    { now },
  );
  // 15:00 is 1h away; 09:00 is 5h away → afternoon wins on today.
  assert.equal(closest?.id, "today-afternoon");

  const noToday = findMeetingClosestToReference(
    [
      meeting({ id: "yesterday", startAt: "2026-09-14T10:00:00" }),
      meeting({ id: "tomorrow", startAt: "2026-09-16T10:00:00" }),
    ],
    { now },
  );
  // Both 1 day away; prefer future when day distance ties.
  assert.equal(noToday?.id, "tomorrow");
});
