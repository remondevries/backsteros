import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  bindTrackedTimerCallbacks,
  checkpointTrackedTimers,
  getTrackedTimerElapsedSeconds,
  isTrackedTimerPersistRefused,
  isTrackedTimerRunning,
  listRecentTrackedTimers,
  pauseTrackedTimer,
  resetTrackedTimerStoreForTests,
  setTrackedTimerRefusePersist,
  startTrackedTimer,
  syncRemoteRunningTimers,
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

  it("does not PATCH after unbind even when the checkpoint interval fires", () => {
    const onPersist = vi.fn();
    const unbind = bindTrackedTimerCallbacks("task-1", {
      onPersist,
      onSessionChange: null,
    });
    startTrackedTimer("task-1", 0);
    unbind();

    vi.advanceTimersByTime(120_000);

    expect(isTrackedTimerRunning("task-1")).toBe(true);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(120);
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

  it("refuses checkpoint/persist writes for a closed task", () => {
    const onPersist = vi.fn();
    const onSessionChange = vi.fn();
    bindTrackedTimerCallbacks("task-1", { onPersist, onSessionChange });
    startTrackedTimer("task-1", 10, { silent: true });
    vi.advanceTimersByTime(5_000);

    setTrackedTimerRefusePersist("task-1", true);
    expect(isTrackedTimerPersistRefused("task-1")).toBe(true);

    expect(checkpointTrackedTimers(true)).toBe(true);
    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(onPersist).not.toHaveBeenCalled();
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("refuses non-silent pause persist for a closed task", () => {
    const onPersist = vi.fn();
    const onSessionChange = vi.fn();
    bindTrackedTimerCallbacks("task-1", { onPersist, onSessionChange });
    startTrackedTimer("task-1", 0, { silent: true });
    vi.advanceTimersByTime(4_000);

    setTrackedTimerRefusePersist("task-1", true);
    pauseTrackedTimer("task-1");

    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(onPersist).not.toHaveBeenCalled();
    expect(onSessionChange).toHaveBeenCalledWith("pause", 4);
  });

  it("does not start a timer when persist is refused", () => {
    setTrackedTimerRefusePersist("task-1", true);
    startTrackedTimer("task-1", 20);
    expect(isTrackedTimerRunning("task-1")).toBe(false);
  });

  it("silent start/pause skips session callbacks", () => {
    const onPersist = vi.fn();
    const onSessionChange = vi.fn();
    bindTrackedTimerCallbacks("task-1", { onPersist, onSessionChange });

    startTrackedTimer("task-1", 5, { silent: true });
    expect(onSessionChange).not.toHaveBeenCalled();
    expect(isTrackedTimerRunning("task-1")).toBe(true);

    vi.advanceTimersByTime(2_000);
    pauseTrackedTimer("task-1", { silent: true });
    expect(onSessionChange).not.toHaveBeenCalled();
    expect(onPersist).not.toHaveBeenCalled();
    expect(isTrackedTimerRunning("task-1")).toBe(false);
  });

  it("adopts a live remote running timer without firing session callbacks", () => {
    const onSessionChange = vi.fn();
    const startedAt = Date.now() - 10_000;
    syncRemoteRunningTimers([
      {
        taskId: "task-1",
        remoteStartedAtMs: startedAt,
        // Fresh checkpoint: 120 total after 10s wall → base 110.
        trackedDurationSeconds: 120,
        trackedMinutes: 2,
        updatedAtMs: Date.now(),
        isRunning: true,
        title: "Ship it",
        subtitle: "OS-1",
        onSessionChange,
      },
    ]);

    expect(isTrackedTimerRunning("task-1")).toBe(true);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(120);
    expect(onSessionChange).not.toHaveBeenCalled();
    expect(listRecentTrackedTimers()).toHaveLength(1);
    expect(listRecentTrackedTimers()[0]?.title).toBe("Ship it");

    vi.advanceTimersByTime(3_000);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(123);
  });

  it("keeps the same elapsed when a late sync re-adopts the same remote start", () => {
    const startedAt = Date.now();
    syncRemoteRunningTimers([
      {
        taskId: "task-1",
        remoteStartedAtMs: startedAt,
        trackedDurationSeconds: 0,
        isRunning: true,
      },
    ]);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(0);

    vi.advanceTimersByTime(5_000);
    syncRemoteRunningTimers([
      {
        taskId: "task-1",
        remoteStartedAtMs: startedAt,
        trackedDurationSeconds: 0,
        isRunning: true,
      },
    ]);
    // Must stay at 5s — adopt-at-Date.now() used to reset and show 0 again.
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(5);

    vi.advanceTimersByTime(5_000);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(10);
  });

  it("seeds a paused remote timer into the recent list", () => {
    syncRemoteRunningTimers([
      {
        taskId: "task-2",
        remoteStartedAtMs: Date.now() - 60_000,
        lastTimerAtMs: Date.now() - 30_000,
        trackedDurationSeconds: 90,
        isRunning: false,
        title: "Paused work",
        subtitle: "BSH-2",
      },
    ]);

    expect(isTrackedTimerRunning("task-2")).toBe(false);
    expect(getTrackedTimerElapsedSeconds("task-2")).toBe(90);
    expect(listRecentTrackedTimers().map((row) => row.key)).toEqual(["task-2"]);
  });

  it("keeps a locally owned timer when remote sync repeats", () => {
    startTrackedTimer("task-1", 30);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(30);

    vi.advanceTimersByTime(5_000);
    syncRemoteRunningTimers([
      {
        taskId: "task-1",
        remoteStartedAtMs: Date.now() - 60_000,
        trackedDurationSeconds: 999,
        updatedAtMs: Date.now(),
        isRunning: true,
      },
    ]);

    // Local clock must not jump to the remote seeded total.
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(35);
  });

  it("keeps a paused chrome row when running-timers sync omits it", () => {
    syncRemoteRunningTimers([
      {
        taskId: "task-1",
        remoteStartedAtMs: Date.now(),
        trackedDurationSeconds: 40,
        updatedAtMs: Date.now(),
        isRunning: true,
      },
    ]);
    expect(isTrackedTimerRunning("task-1")).toBe(true);

    vi.advanceTimersByTime(2_000);
    // running-timers fallback — do not pruneAbsent
    syncRemoteRunningTimers([]);

    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(listRecentTrackedTimers()).toHaveLength(1);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(42);
  });

  it("drops an adopted remote timer when recent-timers membership omits it", () => {
    syncRemoteRunningTimers(
      [
        {
          taskId: "task-1",
          remoteStartedAtMs: Date.now(),
          trackedDurationSeconds: 40,
          updatedAtMs: Date.now(),
          isRunning: true,
        },
      ],
      { pruneAbsent: true },
    );
    expect(isTrackedTimerRunning("task-1")).toBe(true);

    vi.advanceTimersByTime(2_000);
    syncRemoteRunningTimers([], { pruneAbsent: true });

    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(listRecentTrackedTimers()).toHaveLength(0);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(0);
  });

  it("keeps a locally paused timer after stop", () => {
    startTrackedTimer("task-1", 10);
    vi.advanceTimersByTime(5_000);
    pauseTrackedTimer("task-1");

    expect(isTrackedTimerRunning("task-1")).toBe(false);
    expect(listRecentTrackedTimers()).toHaveLength(1);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(15);

    syncRemoteRunningTimers([]);
    expect(listRecentTrackedTimers()).toHaveLength(1);
    expect(getTrackedTimerElapsedSeconds("task-1")).toBe(15);
  });
});
