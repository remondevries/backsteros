import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatLocalYmd,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  parseYmdLocal,
  shouldShowTaskDueDateUrgency,
} from "./task-due-date.js";

describe("formatLocalYmd / parseYmdLocal", () => {
  it("round-trips local calendar dates", () => {
    const date = new Date(2026, 6, 31);
    const ymd = formatLocalYmd(date);
    assert.equal(ymd, "2026-07-31");
    const parsed = parseYmdLocal(ymd);
    assert.ok(parsed);
    assert.equal(formatLocalYmd(parsed), ymd);
  });
});

describe("getTaskDueDateUrgency", () => {
  it("returns overdue for past due dates", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    assert.equal(
      getTaskDueDateUrgency(yesterday, new Date(), { status: "ready_to_start" }),
      "overdue",
    );
  });

  it("returns null for completed tasks", () => {
    const today = new Date();
    assert.equal(
      getTaskDueDateUrgency(today, new Date(), { status: "completed" }),
      null,
    );
  });
});

describe("shouldShowTaskDueDateUrgency", () => {
  it("is true when status is empty", () => {
    assert.equal(shouldShowTaskDueDateUrgency(null), true);
  });

  it("is false for completed tasks", () => {
    assert.equal(shouldShowTaskDueDateUrgency("completed"), false);
  });
});

describe("formatTaskDueMetaLabel", () => {
  it("formats today as Today", () => {
    const today = new Date();
    const label = formatTaskDueMetaLabel(today);
    assert.equal(label, "Today");
  });

  it("keeps bare YMD on the local calendar day (no UTC shift)", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = formatLocalYmd(tomorrow);
    assert.equal(formatTaskDueMetaLabel(ymd), "Tomorrow");
  });
});
