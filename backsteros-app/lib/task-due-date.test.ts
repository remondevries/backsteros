import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getTaskDueDateUrgency,
  shouldShowTaskDueDateUrgency,
} from "./task-due-date";

describe("shouldShowTaskDueDateUrgency", () => {
  it("hides urgency for completed status", () => {
    assert.equal(shouldShowTaskDueDateUrgency("completed"), false);
  });

  it("keeps urgency for other statuses", () => {
    assert.equal(shouldShowTaskDueDateUrgency("in_progress"), true);
    assert.equal(shouldShowTaskDueDateUrgency("triage"), true);
    assert.equal(shouldShowTaskDueDateUrgency(null), true);
  });
});

describe("getTaskDueDateUrgency", () => {
  const today = new Date(2026, 6, 17);
  const overdue = "2026-07-10";
  const soon = "2026-07-19";

  it("marks overdue dates as due_today when open", () => {
    assert.equal(getTaskDueDateUrgency(overdue, today), "due_today");
  });

  it("clears overdue urgency when completed", () => {
    assert.equal(
      getTaskDueDateUrgency(overdue, today, { status: "completed" }),
      null,
    );
  });

  it("keeps overdue urgency for non-completed statuses", () => {
    assert.equal(
      getTaskDueDateUrgency(overdue, today, { status: "in_progress" }),
      "due_today",
    );
  });

  it("still colors due-soon when open", () => {
    assert.equal(getTaskDueDateUrgency(soon, today), "due_soon");
  });
});
