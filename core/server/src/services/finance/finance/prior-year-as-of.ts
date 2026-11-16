/** Format a local Date as YYYY-MM-DD (calendar, not UTC). */
export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Prior-year exclusive end for the same calendar day as `asOf`, leap-safe. */
export function priorYearAsOfExclusive(asOfDate: Date): string {
  const priorYear = asOfDate.getFullYear() - 1;
  const month = asOfDate.getMonth();
  const day = asOfDate.getDate();
  const lastDayOfMonth = new Date(priorYear, month + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfMonth);
  return formatCalendarDate(new Date(priorYear, month, clampedDay + 1));
}
