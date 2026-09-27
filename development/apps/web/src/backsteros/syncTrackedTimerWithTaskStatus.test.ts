import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { syncTrackedTimerWithTaskStatus } from "./syncTrackedTimerWithTaskStatus";
import {
  getTrackedTimerElapsedSeconds,
  isTrackedTimerRunning,
  resetTrackedTimerStoreForTests,
  startTrackedTimer,
} from "./trackedTimerStore";

describe("syncTrackedTimerWithTaskStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
    resetTrackedTimerStoreForTests();
  });

  afterEach(() => {
    resetTrackedTimerStoreForTests();
    vi.useRealTimers();
  });

  it("silently starts when status becomes in_progress", () => {
    const onSessionChange = vi.fn();
    // No bind — silent start should not need callbacks, but guard against posts.
    syncTrackedTimerWithTaskStatus({
      taskId: "task-1",
      status: "in_progress",
      trackedDurationSeconds: 40,
    });
    expect(isTrackedTimerRunning("task-1")).toBe(true);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(40);
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("silently pauses when leaving in_progress", () => {
    startTrackedTimer("task-1", 10, { silent: true });
    vi.advanceTimersByTime(5_000);
    syncTrackedTimerWithTaskStatus({ taskId: "task-1", status: "in_review" });
    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(15);
  });

  it("does not restart an already-running timer", () => {
    startTrackedTimer("task-1", 0, { silent: true });
    vi.advanceTimersByTime(2_000);
    syncTrackedTimerWithTaskStatus({
      taskId: "task-1",
      status: "in_progress",
      trackedDurationSeconds: 0,
    });
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(2);
  });
});
