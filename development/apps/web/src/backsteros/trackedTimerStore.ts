import { trackedDurationSecondsFromElapsed } from "./trackedTime";

const CHECKPOINT_INTERVAL_MS = 60_000;

export type TrackedTimerSessionCallbacks = {
  readonly onPersist: ((seconds: number | null) => void) | null;
  readonly onSessionChange: ((action: "start" | "pause", seconds?: number | null) => void) | null;
};

type TrackedTimerEntry = {
  key: string;
  baseSeconds: number;
  accumulatedSeconds: number;
  sessionStartAt: number | null;
  onPersist: ((seconds: number | null) => void) | null;
  onSessionChange: ((action: "start" | "pause", seconds?: number | null) => void) | null;
};

const entries = new Map<string, TrackedTimerEntry>();
const listeners = new Set<() => void>();

let version = 0;
let tickIntervalId: number | null = null;
let checkpointIntervalId: number | null = null;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function listRunningKeys(): string[] {
  const keys: string[] = [];
  for (const entry of entries.values()) {
    if (entry.sessionStartAt != null) keys.push(entry.key);
  }
  return keys;
}

function anyRunning(): boolean {
  for (const entry of entries.values()) {
    if (entry.sessionStartAt != null) return true;
  }
  return false;
}

function elapsedSecondsForEntry(entry: TrackedTimerEntry): number {
  if (entry.sessionStartAt != null) {
    return entry.baseSeconds + Math.floor((Date.now() - entry.sessionStartAt) / 1000);
  }
  return Math.max(entry.accumulatedSeconds, entry.baseSeconds);
}

function ensureHeartbeat() {
  if (typeof window === "undefined") return;

  if (anyRunning()) {
    if (tickIntervalId == null) {
      tickIntervalId = window.setInterval(() => emit(), 1000);
    }
    if (checkpointIntervalId == null) {
      checkpointIntervalId = window.setInterval(() => {
        checkpointAllRunning();
      }, CHECKPOINT_INTERVAL_MS);
    }
    return;
  }

  if (tickIntervalId != null) {
    window.clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
  if (checkpointIntervalId != null) {
    window.clearInterval(checkpointIntervalId);
    checkpointIntervalId = null;
  }
}

function ensureEntry(key: string): TrackedTimerEntry {
  const existing = entries.get(key);
  if (existing) return existing;
  const created: TrackedTimerEntry = {
    key,
    baseSeconds: 0,
    accumulatedSeconds: 0,
    sessionStartAt: null,
    onPersist: null,
    onSessionChange: null,
  };
  entries.set(key, created);
  return created;
}

function checkpointEntry(entry: TrackedTimerEntry, persist: boolean): boolean {
  if (entry.sessionStartAt == null) return false;
  const seconds = trackedDurationSecondsFromElapsed(elapsedSecondsForEntry(entry));
  if (seconds == null) return false;

  entry.accumulatedSeconds = Math.max(entry.accumulatedSeconds, seconds);
  entry.baseSeconds = entry.accumulatedSeconds;
  entry.sessionStartAt = Date.now();
  entries.set(entry.key, entry);
  if (persist) {
    entry.onPersist?.(seconds);
  }
  return true;
}

function checkpointAllRunning(persist = true): boolean {
  let changed = false;
  for (const key of listRunningKeys()) {
    const entry = entries.get(key);
    if (!entry) continue;
    if (checkpointEntry(entry, persist)) changed = true;
  }
  if (changed) emit();
  return changed;
}

/** Subscribe to timer store changes (ticks, start/pause, checkpoints). */
export function subscribeTrackedTimers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot version for `useSyncExternalStore`. */
export function getTrackedTimerVersion(): number {
  return version;
}

export function isTrackedTimerRunning(key: string): boolean {
  return entries.get(key)?.sessionStartAt != null;
}

export function getTrackedTimerElapsedSeconds(key: string): number {
  const entry = entries.get(key);
  if (!entry) return 0;
  return elapsedSecondsForEntry(entry);
}

/**
 * Keep persist/session callbacks attached while the field is mounted.
 * Unregister clears callbacks but leaves a running session intact.
 */
export function bindTrackedTimerCallbacks(
  key: string,
  callbacks: TrackedTimerSessionCallbacks,
): () => void {
  const entry = ensureEntry(key);
  entry.onPersist = callbacks.onPersist;
  entry.onSessionChange = callbacks.onSessionChange;
  entries.set(key, entry);

  return () => {
    const current = entries.get(key);
    if (!current) return;
    if (current.onPersist === callbacks.onPersist) {
      current.onPersist = null;
    }
    if (current.onSessionChange === callbacks.onSessionChange) {
      current.onSessionChange = null;
    }
    entries.set(key, current);
  };
}

/** Sync stored base from server props when the timer is not running. */
export function syncTrackedTimerDuration(key: string, trackedDurationSeconds: number | null): void {
  const entry = ensureEntry(key);
  if (entry.sessionStartAt != null) return;

  const next = Math.max(0, trackedDurationSeconds ?? 0);
  if (next === entry.baseSeconds && next === entry.accumulatedSeconds) {
    return;
  }

  entry.baseSeconds = Math.max(entry.accumulatedSeconds, next);
  entry.accumulatedSeconds = entry.baseSeconds;
  entries.set(key, entry);
  emit();
}

export function startTrackedTimer(key: string, baseSeconds: number): void {
  const entry = ensureEntry(key);
  if (entry.sessionStartAt != null) {
    ensureHeartbeat();
    return;
  }

  const seconds = Math.max(0, Math.floor(baseSeconds), entry.accumulatedSeconds, entry.baseSeconds);
  entry.baseSeconds = seconds;
  entry.accumulatedSeconds = Math.max(entry.accumulatedSeconds, seconds);
  entry.sessionStartAt = Date.now();
  entries.set(key, entry);
  entry.onSessionChange?.("start");
  ensureHeartbeat();
  emit();
}

export function pauseTrackedTimer(key: string): {
  totalSeconds: number;
  sessionSeconds: number;
} | null {
  const entry = entries.get(key);
  if (!entry || entry.sessionStartAt == null) return null;

  const sessionSeconds = Math.max(0, Math.floor((Date.now() - entry.sessionStartAt) / 1000));
  const totalSeconds = elapsedSecondsForEntry(entry);
  const seconds = trackedDurationSecondsFromElapsed(totalSeconds);

  entry.accumulatedSeconds = Math.max(entry.accumulatedSeconds, totalSeconds);
  entry.baseSeconds = entry.accumulatedSeconds;
  entry.sessionStartAt = null;
  entries.set(key, entry);

  entry.onPersist?.(seconds);
  entry.onSessionChange?.("pause", sessionSeconds);
  ensureHeartbeat();
  emit();

  return { totalSeconds, sessionSeconds };
}

export function toggleTrackedTimer(
  key: string,
  baseSecondsWhenStarting: number,
): "start" | "pause" {
  if (isTrackedTimerRunning(key)) {
    pauseTrackedTimer(key);
    return "pause";
  }
  startTrackedTimer(key, baseSecondsWhenStarting);
  return "start";
}

/** Soft-persist all running timers without stopping them. */
export function checkpointTrackedTimers(persist = true): boolean {
  return checkpointAllRunning(persist);
}

/** Test helper — clears in-memory sessions and heartbeats. */
export function resetTrackedTimerStoreForTests(): void {
  entries.clear();
  if (typeof window !== "undefined") {
    if (tickIntervalId != null) {
      window.clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
    if (checkpointIntervalId != null) {
      window.clearInterval(checkpointIntervalId);
      checkpointIntervalId = null;
    }
  }
  version += 1;
}
