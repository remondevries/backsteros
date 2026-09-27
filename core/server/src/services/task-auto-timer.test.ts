import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextTrackedDurationAfterAutoStop,
  shouldAutoStartTaskTimer,
  shouldAutoStopTaskTimer,
  timerActorFromAssignee,
} from "./task-auto-timer.js";

describe("shouldAutoStartTaskTimer", () => {
  it("starts when entering in_progress from any other status", () => {
    assert.equal(shouldAutoStartTaskTimer("backlog", "in_progress"), true);
    assert.equal(shouldAutoStartTaskTimer("in_review", "in_progress"), true);
    assert.equal(shouldAutoStartTaskTimer(null, "in_progress"), true);
  });

  it("does not start when already in_progress or leaving it", () => {
    assert.equal(shouldAutoStartTaskTimer("in_progress", "in_progress"), false);
    assert.equal(shouldAutoStartTaskTimer("in_progress", "in_review"), false);
    assert.equal(shouldAutoStartTaskTimer("backlog", "ready_to_start"), false);
  });
});

describe("shouldAutoStopTaskTimer", () => {
  it("stops when leaving in_progress for any other status", () => {
    assert.equal(shouldAutoStopTaskTimer("in_progress", "in_review"), true);
    assert.equal(shouldAutoStopTaskTimer("in_progress", "completed"), true);
    assert.equal(shouldAutoStopTaskTimer("in_progress", "on_hold"), true);
    assert.equal(shouldAutoStopTaskTimer("in_progress", "backlog"), true);
  });

  it("does not stop when not leaving in_progress", () => {
    assert.equal(shouldAutoStopTaskTimer("in_progress", "in_progress"), false);
    assert.equal(shouldAutoStopTaskTimer("backlog", "in_review"), false);
    assert.equal(shouldAutoStopTaskTimer("in_review", "completed"), false);
  });
});

describe("timerActorFromAssignee", () => {
  it("uses the assignee contact so auto sessions are not Agent", () => {
    assert.deepEqual(timerActorFromAssignee("contact-1"), {
      userId: null,
      contactId: "contact-1",
      kind: "contact",
    });
  });

  it("omits contact (and Agent kind) when there is no assignee", () => {
    assert.deepEqual(timerActorFromAssignee(null), { userId: null });
    assert.deepEqual(timerActorFromAssignee("  "), { userId: null });
  });
});

describe("nextTrackedDurationAfterAutoStop", () => {
  it("adds the session when no soft checkpoint has written yet", () => {
    assert.equal(
      nextTrackedDurationAfterAutoStop({
        currentTrackedSeconds: 100,
        previousStoppedSecondsSum: 100,
        sessionSeconds: 50,
      }),
      150,
    );
  });

  it("does not double-count a soft-checkpointed running total", () => {
    assert.equal(
      nextTrackedDurationAfterAutoStop({
        currentTrackedSeconds: 150,
        previousStoppedSecondsSum: 100,
        sessionSeconds: 50,
      }),
      150,
    );
  });

  it("preserves a manually higher tracked total", () => {
    assert.equal(
      nextTrackedDurationAfterAutoStop({
        currentTrackedSeconds: 200,
        previousStoppedSecondsSum: 100,
        sessionSeconds: 50,
      }),
      200,
    );
  });
});
