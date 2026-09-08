import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCalendarDayHabitsByDate } from "./calendar-day-habits.js";

test("buildCalendarDayHabitsByDate groups habit tasks by due date", () => {
  const map = buildCalendarDayHabitsByDate(
    [
      { id: "h1", title: "Run", icon: "run", sortOrder: 1 },
      { id: "h2", title: "Read", icon: null, sortOrder: 2 },
    ],
    [
      {
        id: "t1",
        habitId: "h1",
        dueDate: "2026-08-22T12:00:00.000Z",
        status: "completed",
      },
      {
        id: "t2",
        habitId: "h2",
        dueDate: "2026-08-23T12:00:00.000Z",
        status: "ready_to_start",
      },
      {
        id: "t3",
        habitId: "h1",
        dueDate: "2026-08-23T12:00:00.000Z",
        status: "in_progress",
      },
    ],
  );

  const aug22 = map.get("2026-08-22");
  assert.equal(aug22?.length, 1);
  assert.equal(aug22?.[0]?.habitId, "h1");
  assert.equal(aug22?.[0]?.completed, true);

  const aug23 = map.get("2026-08-23");
  assert.equal(aug23, undefined);
});

test("buildCalendarDayHabitsByDate only includes completed habit tasks", () => {
  const map = buildCalendarDayHabitsByDate(
    [{ id: "h1", title: "Run", icon: null }],
    [
      {
        id: "t1",
        habitId: "h1",
        dueDate: "2026-08-22",
        status: "ready_to_start",
      },
      {
        id: "t2",
        habitId: "h1",
        dueDate: "2026-08-23",
        status: "completed",
      },
    ],
  );
  assert.equal(map.get("2026-08-22"), undefined);
  assert.equal(map.get("2026-08-23")?.length, 1);
  assert.equal(map.get("2026-08-23")?.[0]?.completed, true);
});

test("buildCalendarDayHabitsByDate skips canceled habit tasks", () => {
  const map = buildCalendarDayHabitsByDate(
    [{ id: "h1", title: "Run", icon: null }],
    [
      {
        id: "t1",
        habitId: "h1",
        dueDate: "2026-08-22",
        status: "canceled",
      },
    ],
  );
  assert.equal(map.size, 0);
});
