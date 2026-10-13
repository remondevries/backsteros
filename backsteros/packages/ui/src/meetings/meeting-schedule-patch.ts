import {
  endFromStartAndDurationSeconds,
  trackedMinutesFromMeetingSchedule,
} from "@backsteros/contracts";

export function buildMeetingSchedulePatch(
  startAt: Date,
  endAt: Date,
): {
  startAt: string;
  endAt: string;
  trackedMinutes: number | null;
  trackedDurationSeconds: number | null;
} {
  const trackedMinutes = trackedMinutesFromMeetingSchedule(startAt, endAt);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    trackedMinutes,
    trackedDurationSeconds:
      trackedMinutes != null ? trackedMinutes * 60 : null,
  };
}

/** Patch tracked time; syncs meeting end when scheduled on the calendar. */
export function buildMeetingTrackedMinutesPatch(
  startAt: Date | null,
  endAt: Date | null,
  trackedDurationSeconds: number | null,
): {
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  endAt?: string;
} {
  const trackedMinutes =
    trackedDurationSeconds != null && trackedDurationSeconds >= 60
      ? Math.floor(trackedDurationSeconds / 60)
      : null;
  const patch: {
    trackedDurationSeconds: number | null;
    trackedMinutes: number | null;
    endAt?: string;
  } = {
    trackedDurationSeconds,
    trackedMinutes,
  };
  const onCalendar =
    startAt != null &&
    endAt != null &&
    trackedMinutesFromMeetingSchedule(startAt, endAt) != null;
  if (onCalendar && trackedDurationSeconds != null && trackedDurationSeconds > 0) {
    const nextEnd = endFromStartAndDurationSeconds(
      startAt,
      trackedDurationSeconds,
    );
    if (nextEnd) {
      patch.endAt = nextEnd.toISOString();
    }
  }
  return patch;
}
