import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  bindTrackedTimerCallbacks,
  checkpointTrackedTimers,
  getTrackedTimerElapsedSeconds,
  isTrackedTimerRunning,
  pauseTrackedTimer,
  resetTrackedTimerStoreForTests,
  startTrackedTimer,
  syncTrackedTimerDuration,
} from "./trackedTimerStore";

describe("trackedTimerStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
    resetTrackedTimerStoreForTests();
  });

  afterEach(() => {
    resetTrackedTimerStoreForTests();
    vi.useRealTimers();
  });

  it("keeps a session running after callbacks are unbound (panel unmount)", () => {
    const onPersist = vi.fn();
    const onSessionChange = vi.fn();
    const unbind = bindTrackedTimerCallbacks("task-1", {
      onPersist,
      onSessionChange,
    });

    startTrackedTimer("task-1", 60);
    expect(onSessionChange).toHaveBeenCalledWith("start");
    expect(isTrackedTimerRunning("task-1")).toBe(true);

    unbind();
    vi.advanceTimersByTime(5_000);

    expect(isTrackedTimerRunning("task-1")).toBe(true);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(65);
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("pauses only when asked and reports session seconds", () => {
    const onPersist = vi.fn();
    const onSessionChange = vi.fn();
    bindTrackedTimerCallbacks("task-1", { onPersist, onSessionChange });

    startTrackedTimer("task-1", 10);
    vi.advanceTimersByTime(3_000);

    const paused = pauseTrackedTimer("task-1");
    expect(paused).toEqual({ totalSeconds: 13, sessionSeconds: 3 });
    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(onPersist).toHaveBeenCalledWith(13);
    expect(onSessionChange).toHaveBeenCalledWith("pause", 3);
  });

  it("does not regress a paused duration from stale props", () => {
    bindTrackedTimerCallbacks("task-1", {
      onPersist: null,
      onSessionChange: null,
    });
    startTrackedTimer("task-1", 100);
    vi.advanceTimersByTime(20_000);
    pauseTrackedTimer("task-1");

    syncTrackedTimerDuration("task-1", 30);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(120);
  });

  it("checkpoints running timers without stopping them", () => {
    const onPersist = vi.fn();
    bindTrackedTimerCallbacks("task-1", {
      onPersist,
      onSessionChange: null,
    });
    startTrackedTimer("task-1", 0);
    vi.advanceTimersByTime(90_000);

    expect(checkpointTrackedTimers(true)).toBe(true);
    expect(isTrackedTimerRunning("task-1")).toBe(true);
    expect(onPersist).toHaveBeenCalledWith(90);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(90);
  });
});
