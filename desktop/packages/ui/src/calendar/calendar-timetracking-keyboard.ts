import type {
  TimetrackingMonthGroup,
  TimetrackingPeriod,
} from "./calendar-timetracking-days.js";

export function timetrackingSidePanelMonthItemId(monthKey: string): string {
  return `month:${monthKey}`;
}

export function timetrackingSidePanelWeekItemId(weekKey: string): string {
  return `week:${weekKey}`;
}

export function timetrackingSidePanelDayItemId(ymd: string): string {
  return `day:${ymd}`;
}

export function parseTimetrackingSidePanelItemId(
  itemId: string,
):
  | { kind: "month"; monthKey: string }
  | { kind: "week"; weekKey: string }
  | { kind: "day"; ymd: string }
  | null {
  if (itemId.startsWith("month:")) {
    const monthKey = itemId.slice("month:".length);
    return monthKey ? { kind: "month", monthKey } : null;
  }
  if (itemId.startsWith("week:")) {
    const weekKey = itemId.slice("week:".length);
    return weekKey ? { kind: "week", weekKey } : null;
  }
  if (itemId.startsWith("day:")) {
    const ymd = itemId.slice("day:".length);
    return ymd ? { kind: "day", ymd } : null;
  }
  return null;
}

/** Flat j/k targets: month → week → days (days omitted while the week is collapsed). */
export function buildTimetrackingSidePanelKeyboardItemIds(
  monthGroups: readonly TimetrackingMonthGroup[],
  collapsedWeeks: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  for (const month of monthGroups) {
    ids.push(timetrackingSidePanelMonthItemId(month.monthKey));
    for (const week of month.weeks) {
      ids.push(timetrackingSidePanelWeekItemId(week.weekKey));
      if (collapsedWeeks.has(week.weekKey)) continue;
      for (const day of week.days) {
        ids.push(timetrackingSidePanelDayItemId(day.ymd));
      }
    }
  }
  return ids;
}

export function getSelectedTimetrackingSidePanelItemId(
  period: TimetrackingPeriod | null,
): string | null {
  if (!period) return null;
  if (period.kind === "day") {
    return timetrackingSidePanelDayItemId(period.ymd);
  }
  if (period.kind === "week") {
    return timetrackingSidePanelWeekItemId(period.weekKey);
  }
  return timetrackingSidePanelMonthItemId(period.monthKey);
}

export function timetrackingEntryKeyboardItemId(
  kind: "task" | "meeting",
  id: string,
): string {
  return `${kind}:${id}`;
}

export function parseTimetrackingEntryKeyboardItemId(
  itemId: string,
): { kind: "task" | "meeting"; id: string } | null {
  if (itemId.startsWith("task:")) {
    const id = itemId.slice("task:".length);
    return id ? { kind: "task", id } : null;
  }
  if (itemId.startsWith("meeting:")) {
    const id = itemId.slice("meeting:".length);
    return id ? { kind: "meeting", id } : null;
  }
  return null;
}
