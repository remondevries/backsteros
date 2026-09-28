import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  syncRunningTrackedTimersWithTasks,
  syncTrackedTimerWithTaskStatus,
} from "./syncTrackedTimerWithTaskStatus";
import {
  bindTrackedTimerCallbacks,
  getTrackedTimerElapsedSeconds,
  isTrackedTimerPersistRefused,
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

  it("detail refresh to completed pauses without a save or timer activity", () => {
    const onPersist = vi.fn();
    const onSessionChange = vi.fn();
    bindTrackedTimerCallbacks("task-1", { onPersist, onSessionChange });
    startTrackedTimer("task-1", 100, { silent: true });
    vi.advanceTimersByTime(12_000);

    // Soft-poll / detail refresh path when the server returns completed.
    syncTrackedTimerWithTaskStatus({
      taskId: "task-1",
      status: "completed",
      trackedDurationSeconds: 112,
    });

    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(isTrackedTimerPersistRefused("task-1")).toBe(true);
    expect(onPersist).not.toHaveBeenCalled();
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("list/sync status update to closed pauses a running timer without a save", () => {
    const onPersist = vi.fn();
    bindTrackedTimerCallbacks("os-38", { onPersist, onSessionChange: null });
    startTrackedTimer("os-38", 1_600, { silent: true });

    syncRunningTrackedTimersWithTasks([
      { id: "other", status: "in_progress", trackedDurationSeconds: 10 },
      { id: "os-38", status: "canceled", trackedDurationSeconds: 1_612 },
    ]);

    expect(isTrackedTimerRunning("os-38")).toBe(false);
    expect(isTrackedTimerPersistRefused("os-38")).toBe(true);
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("list sync ignores in_progress rows that are not running locally", () => {
    syncRunningTrackedTimersWithTasks([
      { id: "fresh", status: "in_progress", trackedDurationSeconds: 5 },
    ]);
    expect(isTrackedTimerRunning("fresh")).toBe(false);
  });

  it.each(["completed", "canceled", "duplicated", "done"] as const)(
    "refuses persist and pauses for closed status %s",
    (status) => {
      const onPersist = vi.fn();
      bindTrackedTimerCallbacks("task-1", { onPersist, onSessionChange: null });
      startTrackedTimer("task-1", 0, { silent: true });

      syncTrackedTimerWithTaskStatus({ taskId: "task-1", status });

      expect(isTrackedTimerRunning("task-1")).toBe(false);
      expect(isTrackedTimerPersistRefused("task-1")).toBe(true);
      expect(onPersist).not.toHaveBeenCalled();
    },
  );
});
