import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildJournalDayTaskModel } from "./journal-day-tasks.js";

describe("buildJournalDayTaskModel", () => {
  it("splits due tasks and habits for the journal date", () => {
    const model = buildJournalDayTaskModel(
      [
        {
          id: "t1",
          title: "Ship",
          dueDate: "2026-08-27",
          status: "ready_to_start",
        },
        {
          id: "h1",
          title: "Run",
          dueDate: "2026-08-27",
          status: "completed",
          habitId: "habit-run",
        },
        {
          id: "t2",
          title: "Other day",
          dueDate: "2026-08-26",
          status: "ready_to_start",
        },
      ],
      [{ id: "habit-run", title: "Morning run", icon: "person", sortOrder: 1 }],
      "2026-08-27",
    );

    assert.equal(model.dueTasks.length, 1);
    assert.equal(model.dueTasks[0]?.id, "t1");
    assert.equal(model.dayHabitTasks.length, 1);
    assert.equal(model.dayTasks.length, 2);
    assert.equal(model.habitItems.length, 1);
    assert.equal(model.habitItems[0]?.title, "Morning run");
    assert.equal(model.habitItems[0]?.checked, true);
  });

  it("counts lifetime habit outcomes across all days", () => {
    const model = buildJournalDayTaskModel(
      [
        {
          id: "old-done",
          dueDate: "2026-08-01",
          status: "completed",
          habitId: "habit-run",
        },
        {
          id: "old-miss",
          dueDate: "2026-08-02",
          status: "canceled",
          habitId: "habit-run",
        },
        {
          id: "today",
          title: "Run",
          dueDate: "2026-08-27",
          status: "ready_to_start",
          habitId: "habit-run",
        },
        {
          id: "other-habit",
          dueDate: "2026-08-27",
          status: "completed",
          habitId: "habit-read",
        },
      ],
      [
        { id: "habit-run", title: "Run", sortOrder: 0 },
        { id: "habit-read", title: "Read", sortOrder: 1 },
      ],
      "2026-08-27",
    );

    const run = model.habitItems.find((item) => item.habitId === "habit-run");
    assert.ok(run);
    assert.equal(run.completedCount, 1);
    assert.equal(run.missedCount, 1);
    assert.equal(run.checked, false);

    const read = model.habitItems.find((item) => item.habitId === "habit-read");
    assert.ok(read);
    assert.equal(read.completedCount, 1);
    assert.equal(read.missedCount, 0);
  });

  it("respects timezone when converting ISO due timestamps", () => {
    // Still 26 Aug in UTC; already 27 Aug in Tokyo.
    const utcEvening = "2026-08-26T22:00:00.000Z";
    const modelUtc = buildJournalDayTaskModel(
      [{ id: "t1", dueDate: utcEvening, status: "ready_to_start" }],
      [],
      "2026-08-26",
      "UTC",
    );
    const modelTokyo = buildJournalDayTaskModel(
      [{ id: "t1", dueDate: utcEvening, status: "ready_to_start" }],
      [],
      "2026-08-27",
      "Asia/Tokyo",
    );

    assert.equal(modelUtc.dueTasks.length, 1);
    assert.equal(modelTokyo.dueTasks.length, 1);
    assert.equal(
      buildJournalDayTaskModel(
        [{ id: "t1", dueDate: utcEvening, status: "ready_to_start" }],
        [],
        "2026-08-26",
        "Asia/Tokyo",
      ).dueTasks.length,
      0,
    );
  });
});
