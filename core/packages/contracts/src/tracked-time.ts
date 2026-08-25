/** Whole minutes between two instants; null when invalid or non-positive. */
export function minutesBetween(
  start: Date | string | number,
  end: Date | string | number,
): number | null {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const diffMs = endMs - startMs;
  if (diffMs <= 0) return null;
  return Math.round(diffMs / 60_000);
}

export function trackedMinutesFromTaskSchedule(
  dueDate: Date | string | null | undefined,
  dueEndDate: Date | string | null | undefined,
): number | null {
  if (dueDate == null || dueEndDate == null) return null;
  return minutesBetween(dueDate, dueEndDate);
}

export function trackedMinutesFromMeetingSchedule(
  startAt: Date | string | null | undefined,
  endAt: Date | string | null | undefined,
): number | null {
  if (startAt == null || endAt == null) return null;
  return minutesBetween(startAt, endAt);
}

/** Format stored minutes as `HH:MM` for legacy minute-only displays. */
export function formatTrackedMinutes(
  minutes: number | null | undefined,
): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Manual input / stored duration display `HH:MM:SS`. */
export function formatTrackedTimeInput(
  totalSeconds: number | null | undefined,
): string {
  if (
    totalSeconds == null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds <= 0
  ) {
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
export function trackedDurationSecondsFromElapsed(
  totalSeconds: number,
): number | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  return Math.floor(totalSeconds);
}

/** @deprecated Use trackedDurationSecondsFromElapsed — rounds to whole minutes. */
export function trackedMinutesFromDurationSeconds(
  totalSeconds: number,
): number | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  return Math.round(totalSeconds / 60);
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

/** Stored value, else duration derived from a calendar schedule. */
export function resolveTrackedMinutes(input: {
  trackedMinutes?: number | null;
  scheduleMinutes?: number | null;
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
  trackedMinutes?: number | null;
  scheduleMinutes?: number | null;
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

/** End instant `minutes` after `start`; null when invalid. */
export function endFromStartAndTrackedMinutes(
  start: Date | string | number,
  minutes: number | null | undefined,
): Date | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  return new Date(startDate.getTime() + Math.round(minutes) * 60_000);
}

/** End instant `seconds` after `start`; null when invalid. */
export function endFromStartAndDurationSeconds(
  start: Date | string | number,
  totalSeconds: number | null | undefined,
): Date | null {
  if (
    totalSeconds == null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds <= 0
  ) {
    return null;
  }
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  return new Date(startDate.getTime() + Math.floor(totalSeconds) * 1000);
}
