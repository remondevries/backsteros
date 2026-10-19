import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveOpenRunningTimer,
  OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS,
} from "./tracked-time.js";

const now = Date.parse("2026-10-16T11:00:00.000Z");

test("a fresh play with no stored time is still running", () => {
  assert.equal(
    isActiveOpenRunningTimer({
      startedAtMs: now - 30_000,
      trackedDurationSeconds: null,
      nowMs: now,
    }),
    true,
  );
});

test("an old play with no time entry is not running", () => {
  assert.equal(
    isActiveOpenRunningTimer({
      startedAtMs: now - OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS - 1,
      trackedDurationSeconds: null,
      trackedMinutes: null,
      nowMs: now,
    }),
    false,
  );
});

test("stored duration on an old start is not a live timer", () => {
  assert.equal(
    isActiveOpenRunningTimer({
      startedAtMs: now - 24 * 60 * 60 * 1000,
      trackedDurationSeconds: 120,
      updatedAtMs: now - 60 * 60 * 1000,
      nowMs: now,
    }),
    false,
  );
});

test("a recent checkpoint keeps an older open timer running", () => {
  assert.equal(
    isActiveOpenRunningTimer({
      startedAtMs: now - 2 * 60 * 60 * 1000,
      trackedDurationSeconds: 7200,
      updatedAtMs: now - 30_000,
      nowMs: now,
    }),
    true,
  );
});
