/** Tracked-time helpers mirroring `@backsteros/contracts` tracked-time. */

/**
 * How long an unpaired play stays "running" without a fresh checkpoint.
 * Mirrors `OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS` in contracts.
 */
export const OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS = 3 * 60 * 1000;

function storedRunningSeconds(input: {
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null;
}): number {
  if (
    input.trackedDurationSeconds != null &&
    Number.isFinite(input.trackedDurationSeconds) &&
    input.trackedDurationSeconds > 0
  ) {
    return input.trackedDurationSeconds;
  }
  if (
    input.trackedMinutes != null &&
    Number.isFinite(input.trackedMinutes) &&
    input.trackedMinutes > 0
  ) {
    return input.trackedMinutes * 60;
  }
  return 0;
}

/** True when a remote unpaired `timer_started` should still drive a live clock. */
export function isActiveOpenRunningTimer(input: {
  startedAtMs: number;
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null;
  updatedAtMs?: number | null;
  nowMs?: number;
}): boolean {
  if (!Number.isFinite(input.startedAtMs)) return false;
  const now = input.nowMs ?? Date.now();
  const age = now - input.startedAtMs;
  if (age < 0) return false;
  if (age <= OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS) return true;
  if (storedRunningSeconds(input) <= 0) return false;
  if (input.updatedAtMs == null || !Number.isFinite(input.updatedAtMs)) {
    return false;
  }
  return now - input.updatedAtMs <= OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS;
}

/**
 * Shared wall clock for adopted remote running timers (mirrors contracts).
 * Anchors at `remoteStartedAtMs` so OS / DESIGN / DEV show the same elapsed.
 */
export function adoptRemoteRunningTimerClock(input: {
  remoteStartedAtMs: number;
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null;
  updatedAtMs?: number | null;
  nowMs?: number;
}): { sessionStartAt: number; baseSeconds: number } {
  const start = input.remoteStartedAtMs;
  const now = input.nowMs ?? Date.now();
  const seeded = storedRunningSeconds(input);
  if (!Number.isFinite(start)) {
    return { sessionStartAt: now, baseSeconds: seeded };
  }

  const updatedAt = input.updatedAtMs;
  if (
    updatedAt != null &&
    Number.isFinite(updatedAt) &&
    updatedAt >= start &&
    now - updatedAt <= OPEN_RUNNING_TIMER_WITHOUT_ENTRY_GRACE_MS
  ) {
    const wallAtCheckpoint = Math.max(
      0,
      Math.floor((updatedAt - start) / 1000),
    );
    return {
      sessionStartAt: start,
      baseSeconds: Math.max(0, seeded - wallAtCheckpoint),
    };
  }

  return { sessionStartAt: start, baseSeconds: seeded };
}

/** Manual input / stored duration display `HH:MM:SS`. */
export function formatTrackedTimeInput(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "";
  }
  return formatTrackedDuration(Math.floor(totalSeconds));
}

/** Live timer display `HH:MM:SS`. */
export function formatTrackedDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Persist elapsed timer duration as whole seconds. */
export function trackedDurationSecondsFromElapsed(totalSeconds: number): number | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  return Math.floor(totalSeconds);
}

/** Parse `H:MM`, `HH:MM`, or `HH:MM:SS` into total seconds. */
export function parseTrackedTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hms = /^(\d{1,4}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (hms) {
    const hours = Number(hms[1]);
    const mins = Number(hms[2]);
    const secs = Number(hms[3]);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(mins) ||
      !Number.isFinite(secs) ||
      mins >= 60 ||
      secs >= 60
    ) {
      return null;
    }
    return hours * 3600 + mins * 60 + secs;
  }

  const hm = /^(\d{1,4}):(\d{2})$/.exec(trimmed);
  if (!hm) return null;
  const hours = Number(hm[1]);
  const mins = Number(hm[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || mins >= 60) {
    return null;
  }
  return hours * 3600 + mins * 60;
}

function resolveTrackedMinutes(input: {
  trackedMinutes?: number | null | undefined;
  scheduleMinutes?: number | null | undefined;
}): number | null {
  if (
    input.trackedMinutes != null &&
    Number.isFinite(input.trackedMinutes) &&
    input.trackedMinutes >= 0
  ) {
    return Math.round(input.trackedMinutes);
  }
  if (
    input.scheduleMinutes != null &&
    Number.isFinite(input.scheduleMinutes) &&
    input.scheduleMinutes > 0
  ) {
    return Math.round(input.scheduleMinutes);
  }
  return null;
}

/** Resolve precise tracked duration in seconds for timers and manual entry. */
export function resolveTrackedDurationSeconds(input: {
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null | undefined;
  scheduleMinutes?: number | null | undefined;
}): number | null {
  if (
    input.trackedDurationSeconds != null &&
    Number.isFinite(input.trackedDurationSeconds) &&
    input.trackedDurationSeconds > 0
  ) {
    return Math.floor(input.trackedDurationSeconds);
  }
  const minutes = resolveTrackedMinutes({
    trackedMinutes: input.trackedMinutes,
    scheduleMinutes: input.scheduleMinutes,
  });
  if (minutes == null || minutes <= 0) return null;
  return minutes * 60;
}
