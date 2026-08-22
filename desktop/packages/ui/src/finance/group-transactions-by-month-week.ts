export type TransactionDateRow = {
  id: string;
  bookedOn: string;
};

export type TransactionWeekGroup<T extends TransactionDateRow> = {
  weekKey: string;
  label: string;
  weekStart: string;
  items: T[];
};

export type TransactionMonthGroup<T extends TransactionDateRow> = {
  monthKey: string;
  label: string;
  weeks: TransactionWeekGroup<T>[];
};

function parseBookedOn(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Monday-start local week containing `date`. */
export function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y!, m! - 1, 1);
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function weekLabel(weekStart: Date): string {
  const label = weekStart.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `Week of ${label}`;
}

/**
 * Group newest-first by calendar month, then Monday-start weeks within each month.
 */
export function groupTransactionsByMonthWeek<T extends TransactionDateRow>(
  rows: T[],
): TransactionMonthGroup<T>[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.bookedOn === b.bookedOn) return b.id.localeCompare(a.id);
    return a.bookedOn < b.bookedOn ? 1 : -1;
  });

  const months = new Map<string, Map<string, TransactionWeekGroup<T>>>();

  for (const row of sorted) {
    const monthKey = row.bookedOn.slice(0, 7);
    const booked = parseBookedOn(row.bookedOn);
    const weekStart = startOfWeekMonday(booked);
    const weekKey = formatIsoDate(weekStart);

    let weekMap = months.get(monthKey);
    if (!weekMap) {
      weekMap = new Map();
      months.set(monthKey, weekMap);
    }
    let week = weekMap.get(weekKey);
    if (!week) {
      week = {
        weekKey,
        label: weekLabel(weekStart),
        weekStart: weekKey,
        items: [],
      };
      weekMap.set(weekKey, week);
    }
    week.items.push(row);
  }

  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([monthKey, weekMap]) => ({
      monthKey,
      label: monthLabel(monthKey),
      weeks: [...weekMap.values()].sort((a, b) =>
        a.weekStart < b.weekStart ? 1 : -1,
      ),
    }));
}
