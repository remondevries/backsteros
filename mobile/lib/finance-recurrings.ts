import { monthKeyForDate } from "./finance-format";
import type { FinanceRecurringRow } from "./use-finance-recurrings";

export type RecurringDateGroupId = "this_month" | "future" | "archived";

export const RECURRING_GROUP_ORDER: readonly RecurringDateGroupId[] = [
  "this_month",
  "future",
  "archived",
] as const;

export const RECURRING_GROUP_LABELS: Record<RecurringDateGroupId, string> = {
  this_month: "This month",
  future: "In the future",
  archived: "Archived",
};

export type RecurringDateGroup = {
  id: RecurringDateGroupId;
  label: string;
  recurrings: FinanceRecurringRow[];
};

/**
 * Monthly recurrings store a calendar `nextDate`. When that date falls in a
 * past month, roll it forward (desktop `advanceMonthlyNextDate` parity).
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
  let month = Number(match[2]);
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
  const targetMonth = asOf.getMonth() + 1;

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
 * Next payment date that is today or later (dashboard “Next two weeks”).
 * If the month-rolled date is already past within the current month, advances
 * one more month. Desktop `upcomingMonthlyPaymentDate` parity.
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

/** Inclusive window: today through today + 14 days (desktop dashboard). */
export const NEXT_TWO_WEEKS_DAYS = 14;

export type UpcomingRecurringItem = {
  id: string;
  name: string;
  icon: string | null;
  amountCents: number | null;
  paymentDate: string;
};

function addLocalDaysIso(iso: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
  );
  return formatYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Active recurrings due within the next two weeks. */
export function buildUpcomingRecurrings(
  recurrings: readonly FinanceRecurringRow[],
  asOf: Date = new Date(),
): UpcomingRecurringItem[] {
  const start = formatYmd(
    asOf.getFullYear(),
    asOf.getMonth() + 1,
    asOf.getDate(),
  );
  const end = addLocalDaysIso(start, NEXT_TWO_WEEKS_DAYS);
  if (!end) return [];

  const items: UpcomingRecurringItem[] = [];
  for (const row of recurrings) {
    if (row.archived) continue;
    const paymentDate = upcomingMonthlyPaymentDate(row.nextDate, asOf);
    if (!paymentDate) continue;
    if (paymentDate < start || paymentDate > end) continue;
    items.push({
      id: row.id,
      name: row.name,
      icon: row.icon,
      amountCents:
        row.amountCents != null && row.amountCents > 0 ? row.amountCents : null,
      paymentDate,
    });
  }

  return items.sort(
    (a, b) =>
      a.paymentDate.localeCompare(b.paymentDate) ||
      a.name.localeCompare(b.name),
  );
}

export function recurringDateGroup(
  nextDate: string | null | undefined,
  archived = false,
  asOf: Date = new Date(),
): RecurringDateGroupId {
  if (archived) return "archived";
  const effective = advanceMonthlyNextDate(nextDate, asOf);
  if (!effective || effective.length < 7) return "future";
  return effective.slice(0, 7) === monthKeyForDate(asOf)
    ? "this_month"
    : "future";
}

/** Group recurrings for SectionList (desktop Recurrings view parity). */
export function groupRecurringsByDate(
  rows: readonly FinanceRecurringRow[],
  asOf: Date = new Date(),
): RecurringDateGroup[] {
  const buckets: Record<RecurringDateGroupId, FinanceRecurringRow[]> = {
    this_month: [],
    future: [],
    archived: [],
  };
  for (const row of rows) {
    buckets[recurringDateGroup(row.nextDate, row.archived, asOf)].push(row);
  }
  for (const id of RECURRING_GROUP_ORDER) {
    buckets[id].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
  }
  return RECURRING_GROUP_ORDER.map((id) => ({
    id,
    label: RECURRING_GROUP_LABELS[id],
    recurrings: buckets[id],
  })).filter((group) => group.recurrings.length > 0);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
