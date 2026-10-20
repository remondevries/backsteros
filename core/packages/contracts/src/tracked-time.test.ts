import assert from "node:assert/strict";
import test from "node:test";

import {
  adoptRemoteRunningTimerClock,
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

test("adopt clock anchors at remote start so late adopters match", () => {
  const startedAtMs = now - 10_000;
  const early = adoptRemoteRunningTimerClock({
    remoteStartedAtMs: startedAtMs,
    trackedDurationSeconds: 0,
    nowMs: now - 5_000,
  });
  const late = adoptRemoteRunningTimerClock({
    remoteStartedAtMs: startedAtMs,
    trackedDurationSeconds: 0,
    nowMs: now,
  });
  assert.equal(early.sessionStartAt, startedAtMs);
  assert.equal(late.sessionStartAt, startedAtMs);
  assert.equal(early.baseSeconds, 0);
  assert.equal(late.baseSeconds, 0);
  const earlyElapsed =
    early.baseSeconds + Math.floor((now - early.sessionStartAt) / 1000);
  const lateElapsed =
    late.baseSeconds + Math.floor((now - late.sessionStartAt) / 1000);
  assert.equal(earlyElapsed, lateElapsed);
  assert.equal(lateElapsed, 10);
});

test("adopt clock subtracts wall time from a fresh soft checkpoint", () => {
  const startedAtMs = now - 60_000;
  const clock = adoptRemoteRunningTimerClock({
    remoteStartedAtMs: startedAtMs,
    trackedDurationSeconds: 90,
    updatedAtMs: now,
    nowMs: now,
  });
  assert.equal(clock.sessionStartAt, startedAtMs);
  assert.equal(clock.baseSeconds, 30);
  assert.equal(
    clock.baseSeconds + Math.floor((now - clock.sessionStartAt) / 1000),
    90,
  );
});
