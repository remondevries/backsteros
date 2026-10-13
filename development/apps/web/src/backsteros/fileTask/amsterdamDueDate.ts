/** Europe/Amsterdam end-of-day → UTC ISO for BacksterOS task due dates. */

export const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Calendar YMD for `date` in Europe/Amsterdam (`YYYY-MM-DD`). */
export function amsterdamCalendarYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Instant when Amsterdam wall-clock on `ymd` is `hour:minute:second`.
 * Iterates from a UTC guess so CET/CEST offsets stay correct.
 */
export function amsterdamWallTimeToUtcIso(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) {
    throw new Error(`Invalid Amsterdam calendar day: ${ymd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Start near CEST (UTC+2) — loop corrects for CET/CEST.
  let utcMillis = Date.UTC(year, month - 1, day, hour - 2, minute, second, 0);

  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: AMSTERDAM_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMillis));

    const read = (type: Intl.DateTimeFormatPartTypes): number => {
      const value = parts.find((part) => part.type === type)?.value;
      return value ? Number(value) : NaN;
    };

    const asYear = read("year");
    const asMonth = read("month");
    const asDay = read("day");
    const asHour = read("hour");
    const asMinute = read("minute");
    const asSecond = read("second");

    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(asYear, asMonth - 1, asDay, asHour, asMinute, asSecond);
    const delta = desired - actual;
    if (delta === 0) break;
    utcMillis += delta;
  }

  return new Date(utcMillis).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

/**
 * End of the Amsterdam calendar day for `date` (or today), as UTC ISO.
 * CEST → `…T21:59:59.000Z`; CET → `…T22:59:59.000Z`. Never `T23:59:59.000Z`.
 */
export function amsterdamEndOfDayDueDateIso(date: Date = new Date()): string {
  return amsterdamWallTimeToUtcIso(amsterdamCalendarYmd(date), 23, 59, 59);
}
