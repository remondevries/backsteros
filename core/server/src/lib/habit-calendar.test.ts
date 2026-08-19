import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dueDateToYmd,
  formatYmdInTimeZone,
  habitNeedsTodayTask,
  isHabitDueYmd,
  isHealthProjectName,
  isOpenHabitTaskStatus,
  nextEvery2DaysDueYmd,
  nextHealthProjectKey,
  parseHabitCadence,
  shouldCancelStaleHabitTask,
  duplicateHabitDayTaskIdsToRemove,
  ymdStartOfDayIso,
} from "./habit-calendar.js";

describe("isHealthProjectName", () => {
  it("matches health case-insensitively", () => {
    assert.equal(isHealthProjectName("Health"), true);
    assert.equal(isHealthProjectName(" health "), true);
    assert.equal(isHealthProjectName("HEALTH"), true);
    assert.equal(isHealthProjectName("Healthcare"), false);
  });
});

describe("habit task status", () => {
  it("treats completed and canceled as closed", () => {
    assert.equal(isOpenHabitTaskStatus("ready_to_start"), true);
    assert.equal(isOpenHabitTaskStatus("completed"), false);
    assert.equal(isOpenHabitTaskStatus("canceled"), false);
  });

  it("drops extra same-day instances, keeping a completion when present", () => {
    assert.deepEqual(
      duplicateHabitDayTaskIdsToRemove([
        { id: "b", status: "ready_to_start" },
        { id: "a", status: "ready_to_start" },
      ]),
      ["b"],
    );
    assert.deepEqual(
      duplicateHabitDayTaskIdsToRemove([
        { id: "open", status: "ready_to_start" },
        { id: "done", status: "completed" },
      ]),
      ["open"],
    );
    assert.deepEqual(duplicateHabitDayTaskIdsToRemove([{ id: "only", status: "ready_to_start" }]), []);
  });

  it("cancels only open tasks due before today", () => {
    assert.equal(
      shouldCancelStaleHabitTask("ready_to_start", "2026-08-15", "2026-08-16"),
      true,
    );
    assert.equal(
      shouldCancelStaleHabitTask("completed", "2026-08-15", "2026-08-16"),
      false,
    );
    assert.equal(
      shouldCancelStaleHabitTask("ready_to_start", "2026-08-16", "2026-08-16"),
      false,
    );
    assert.equal(
      shouldCancelStaleHabitTask("ready_to_start", null, "2026-08-16"),
      false,
    );
  });

  it("creates today only when no instance exists for that due day", () => {
    assert.equal(habitNeedsTodayTask(["2026-08-15"], "2026-08-16"), true);
    assert.equal(habitNeedsTodayTask(["2026-08-16"], "2026-08-16"), false);
    assert.equal(
      habitNeedsTodayTask(["2026-08-16", "2026-08-15"], "2026-08-16"),
      false,
    );
  });

  it("does not create today when an open instance is scheduled later", () => {
    assert.equal(
      habitNeedsTodayTask(
        ["2026-08-20"],
        "2026-08-16",
        "daily",
        "2026-08-20",
        [{ dueYmd: "2026-08-20", status: "ready_to_start" }],
      ),
      false,
    );
  });

  it("respects cadence when deciding whether today needs a task", () => {
    // every_2_days: completed → wait 2 days
    assert.equal(
      habitNeedsTodayTask(
        ["2026-08-14"],
        "2026-08-16",
        "every_2_days",
        "2026-08-14",
        [{ dueYmd: "2026-08-14", status: "completed" }],
      ),
      true,
    );
    assert.equal(
      habitNeedsTodayTask(
        ["2026-08-15"],
        "2026-08-16",
        "every_2_days",
        "2026-08-15",
        [{ dueYmd: "2026-08-15", status: "completed" }],
      ),
      false,
    );
    // every_2_days: missed (canceled) → due the next day (catch-up), not skip
    assert.equal(
      habitNeedsTodayTask(
        ["2026-08-15"],
        "2026-08-16",
        "every_2_days",
        "2026-08-15",
        [{ dueYmd: "2026-08-15", status: "canceled" }],
      ),
      true,
    );
    // weekly keeps the fixed weekday grid (miss does not shift to tomorrow)
    assert.equal(
      habitNeedsTodayTask(["2026-08-09"], "2026-08-16", "weekly", "2026-08-09"),
      true,
    );
    assert.equal(
      habitNeedsTodayTask(
        ["2026-08-09"],
        "2026-08-10",
        "weekly",
        "2026-08-09",
        [{ dueYmd: "2026-08-09", status: "canceled" }],
      ),
      false,
    );
    assert.equal(
      habitNeedsTodayTask(["2026-08-10"], "2026-08-16", "weekly", "2026-08-10"),
      false,
    );
    assert.equal(
      habitNeedsTodayTask(["2026-07-16"], "2026-08-16", "monthly", "2026-07-16"),
      true,
    );
    assert.equal(
      habitNeedsTodayTask(["2026-07-15"], "2026-08-16", "monthly", "2026-07-15"),
      false,
    );
  });
});

describe("habit cadence", () => {
  it("defaults unknown values to daily", () => {
    assert.equal(parseHabitCadence("weekly"), "weekly");
    assert.equal(parseHabitCadence("nope"), "daily");
  });

  it("treats monthly due days as the same calendar day, or month end when needed", () => {
    assert.equal(isHabitDueYmd("monthly", "2026-01-31", "2026-02-28"), true);
    assert.equal(isHabitDueYmd("monthly", "2026-01-31", "2026-03-31"), true);
    assert.equal(isHabitDueYmd("monthly", "2026-01-31", "2026-02-27"), false);
  });

  it("rolls every_2_days forward one day after a miss, not a fixed grid skip", () => {
    assert.equal(
      isHabitDueYmd("every_2_days", "2026-08-15", "2026-08-16", [
        { dueYmd: "2026-08-15", status: "canceled" },
      ]),
      true,
    );
    assert.equal(
      isHabitDueYmd("every_2_days", "2026-08-15", "2026-08-16", [
        { dueYmd: "2026-08-15", status: "completed" },
      ]),
      false,
    );
  });

  it("resets every_2_days from an early completion instead of a stale open day", () => {
    assert.equal(
      nextEvery2DaysDueYmd(
        [
          { dueYmd: "2026-08-14", status: "completed" },
          { dueYmd: "2026-08-15", status: "completed" },
          { dueYmd: "2026-08-16", status: "ready_to_start" },
        ],
        "2026-08-14",
      ),
      "2026-08-17",
    );
    assert.equal(
      habitNeedsTodayTask(
        ["2026-08-14", "2026-08-15"],
        "2026-08-15",
        "every_2_days",
        "2026-08-14",
        [
          { dueYmd: "2026-08-14", status: "completed" },
          { dueYmd: "2026-08-15", status: "completed" },
        ],
      ),
      false,
    );
  });
});

describe("habit calendar timezone", () => {
  it("formats a UTC instant as the workspace calendar day", () => {
    const lateUtc = new Date("2026-08-15T22:30:00.000Z");
    assert.equal(formatYmdInTimeZone(lateUtc, "Europe/Amsterdam"), "2026-08-16");
    assert.equal(formatYmdInTimeZone(lateUtc, "UTC"), "2026-08-15");
  });

  it("builds a due-date ISO that still maps back to the same YMD", () => {
    const iso = ymdStartOfDayIso("2026-08-16", "Europe/Amsterdam");
    assert.equal(dueDateToYmd(iso, "Europe/Amsterdam"), "2026-08-16");
    assert.equal(new Date(iso).toISOString(), iso);
  });
});

describe("nextHealthProjectKey", () => {
  it("uses HLT when free", () => {
    assert.equal(nextHealthProjectKey(["BOS", "IN"]), "HLT");
  });

  it("skips taken preferred keys", () => {
    assert.equal(nextHealthProjectKey(["HLT", "HEA"]), "HL");
  });
});
