import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RECENT_TASK_TIMER_LIMIT,
  RECENT_TASK_TIMER_MAX_AGE_MS,
  toRecentTaskTimer,
} from "./task-recent-timers.js";

const now = Date.parse("2026-10-20T12:00:00.000Z");

describe("toRecentTaskTimer", () => {
  it("marks a fresh unpaired start as running", () => {
    const timer = toRecentTaskTimer(
      {
        taskId: "task-1",
        lastTimerAt: new Date(now - 30_000),
        latestType: "timer_started",
        title: "Ship dropdown",
        number: 12,
        status: "in_progress",
        trackedDurationSeconds: 120,
        trackedMinutes: 2,
        projectKey: "OS",
        updatedAt: new Date(now - 10_000),
      },
      now,
    );
    assert.equal(timer.isRunning, true);
    assert.equal(timer.lastTimerAt.getTime(), now - 30_000);
    assert.equal(timer.startedAt.getTime(), now - 30_000);
    assert.equal(timer.number, 12);
    assert.equal(timer.projectKey, "OS");
  });

  it("marks a stopped session as paused", () => {
    const timer = toRecentTaskTimer(
      {
        taskId: "task-2",
        lastTimerAt: new Date(now - 60_000),
        latestType: "timer_stopped",
        title: "Paused work",
        number: 3,
        status: "ready_to_start",
        trackedDurationSeconds: 600,
        trackedMinutes: 10,
        projectKey: "BSH",
        updatedAt: new Date(now - 60_000),
      },
      now,
    );
    assert.equal(timer.isRunning, false);
    assert.equal(timer.trackedDurationSeconds, 600);
  });

  it("does not treat an abandoned unpaired start as running", () => {
    const timer = toRecentTaskTimer(
      {
        taskId: "task-3",
        lastTimerAt: new Date(now - 24 * 60 * 60 * 1000),
        latestType: "timer_started",
        title: "Stale",
        number: 1,
        status: "in_progress",
        trackedDurationSeconds: 90,
        trackedMinutes: 1,
        projectKey: "OS",
        updatedAt: new Date(now - 60 * 60 * 1000),
      },
      now,
    );
    assert.equal(timer.isRunning, false);
  });
});

describe("recent timer defaults", () => {
  it("keeps a 14-day window and 20-row cap", () => {
    assert.equal(RECENT_TASK_TIMER_MAX_AGE_MS, 14 * 24 * 60 * 60 * 1000);
    assert.equal(RECENT_TASK_TIMER_LIMIT, 20);
  });
});
