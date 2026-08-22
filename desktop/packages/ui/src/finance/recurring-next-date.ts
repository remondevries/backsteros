/**
 * Monthly recurrings store a calendar `nextDate`. When that date falls in a
 * past month, roll it forward to the same day-of-month in the current month
 * (clamping when the day does not exist, e.g. Jan 31 → Feb 28).
 *
 * Dates in the current or a future month are left unchanged.
 */

export function advanceMonthlyNextDate(
  nextDate: string | null | undefined,
  asOf: Date = new Date(),
): string | null {
  if (nextDate == null || nextDate === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextDate);
  if (!match) return nextDate;

  const preferredDay = Number(match[3]);
  let year = Number(match[1]);
  let month = Number(match[2]); // 1–12
  if (
    !Number.isFinite(preferredDay) ||
    preferredDay < 1 ||
    preferredDay > 31 ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return nextDate;
  }

  const targetYear = asOf.getFullYear();
  const targetMonth = asOf.getMonth() + 1; // 1–12

  // Already current month or later — keep as stored (including intentional future).
  if (year > targetYear || (year === targetYear && month >= targetMonth)) {
    return formatYmd(
      year,
      month,
      Math.min(preferredDay, daysInMonth(year, month)),
    );
  }

  while (year < targetYear || (year === targetYear && month < targetMonth)) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return formatYmd(
    year,
    month,
    Math.min(preferredDay, daysInMonth(year, month)),
  );
}

/**
 * Next payment date that is today or later (for schedules / “upcoming” widgets).
 * If the month-rolled date is already past within the current month, advances
 * one more month.
 */
export function upcomingMonthlyPaymentDate(
  nextDate: string | null | undefined,
  asOf: Date = new Date(),
): string | null {
  const rolled = advanceMonthlyNextDate(nextDate, asOf);
  if (!rolled) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rolled);
  if (!match) return rolled;

  const today = formatYmd(
    asOf.getFullYear(),
    asOf.getMonth() + 1,
    asOf.getDate(),
  );
  if (rolled >= today) return rolled;

  const preferredDay = Number(match[3]);
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return formatYmd(
    year,
    month,
    Math.min(preferredDay, daysInMonth(year, month)),
  );
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
