import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextPausedTimerAccumulatedSeconds,
  resolveEffectiveTrackedDurationSeconds,
  shouldClearPendingTrackedSeconds,
  shouldSkipEmptyPausedTimerSync,
  shouldSyncTrackedTimeDraft,
} from "./tracked-timer-duration-sync.js";

describe("resolveEffectiveTrackedDurationSeconds", () => {
  it("prefers pending exclusively while optimistic", () => {
    assert.equal(
      resolveEffectiveTrackedDurationSeconds({
        hasPending: true,
        pendingSeconds: 90,
        trackedDurationSeconds: 300,
      }),
      90,
    );
  });

  it("falls back to props when not pending", () => {
    assert.equal(
      resolveEffectiveTrackedDurationSeconds({
        hasPending: false,
        pendingSeconds: 90,
        trackedDurationSeconds: 300,
      }),
      300,
    );
  });

  it("allows pending clear to null", () => {
    assert.equal(
      resolveEffectiveTrackedDurationSeconds({
        hasPending: true,
        pendingSeconds: null,
        trackedDurationSeconds: 300,
      }),
      null,
    );
  });
});

describe("shouldClearPendingTrackedSeconds", () => {
  it("clears only when props match the pending value", () => {
    assert.equal(
      shouldClearPendingTrackedSeconds({
        hasPending: true,
        pendingSeconds: 90,
        trackedDurationSeconds: 90,
      }),
      true,
    );
  });

  it("keeps pending when stale props are still higher", () => {
    assert.equal(
      shouldClearPendingTrackedSeconds({
        hasPending: true,
        pendingSeconds: 90,
        trackedDurationSeconds: 300,
      }),
      false,
    );
  });

  it("keeps pending when props have not caught a clear yet", () => {
    assert.equal(
      shouldClearPendingTrackedSeconds({
        hasPending: true,
        pendingSeconds: null,
        trackedDurationSeconds: 300,
      }),
      false,
    );
  });
});

describe("shouldSyncTrackedTimeDraft", () => {
  it("does not sync draft while editing", () => {
    assert.equal(
      shouldSyncTrackedTimeDraft({ isEditingTime: true, isRunning: false }),
      false,
    );
  });

  it("does not sync draft while the timer is running", () => {
    assert.equal(
      shouldSyncTrackedTimeDraft({ isEditingTime: false, isRunning: true }),
      false,
    );
  });

  it("syncs draft when idle and not editing", () => {
    assert.equal(
      shouldSyncTrackedTimeDraft({ isEditingTime: false, isRunning: false }),
      true,
    );
  });
});

describe("nextPausedTimerAccumulatedSeconds", () => {
  it("applies an explicit manual decrease", () => {
    assert.equal(
      nextPausedTimerAccumulatedSeconds({
        trackedDurationSeconds: 90,
        resolvedSeconds: 90,
        previousAccumulatedSeconds: 300,
      }),
      90,
    );
  });

  it("keeps memory when props are empty", () => {
    assert.equal(
      nextPausedTimerAccumulatedSeconds({
        trackedDurationSeconds: null,
        resolvedSeconds: 0,
        previousAccumulatedSeconds: 300,
      }),
      300,
    );
  });

  it("skips empty sync while memory still has a total", () => {
    assert.equal(
      shouldSkipEmptyPausedTimerSync({
        trackedDurationSeconds: null,
        resolvedSeconds: 0,
        previousAccumulatedSeconds: 300,
      }),
      true,
    );
  });
});
