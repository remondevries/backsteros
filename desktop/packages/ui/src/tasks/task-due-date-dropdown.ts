import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { searchableDropdownShortcut } from "../dropdowns/searchable-dropdown-shortcuts.js";
import { formatLocalYmd, formatTaskDueMetaLabel } from "./task-due-date.js";

export const TASK_NO_DUE_DATE_VALUE = "__no_due_date__";
export const TASK_PICK_DUE_DATE_VALUE = "__pick_due_date__";

function addLocalDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function taskDueDateDropdownValue(
  dueDate: string | null | undefined,
): string {
  const ymd = (dueDate ?? "").trim().slice(0, 10);
  return ymd || TASK_NO_DUE_DATE_VALUE;
}

export function taskDueDateFromDropdownValue(value: string): string | null {
  if (value === TASK_NO_DUE_DATE_VALUE || value === TASK_PICK_DUE_DATE_VALUE) {
    return null;
  }
  const ymd = value.trim().slice(0, 10);
  return ymd || null;
}

export function isPickDueDateValue(value: string): boolean {
  return value === TASK_PICK_DUE_DATE_VALUE;
}

export function buildTaskDueDateDropdownOptions(
  currentDueDate: string | null | undefined,
  now = new Date(),
  noDueDateLabel = "No due date",
  options?: { allowClear?: boolean },
): SearchableDropdownOption[] {
  const allowClear = options?.allowClear !== false;
  const today = formatLocalYmd(now);
  const tomorrow = formatLocalYmd(addLocalDays(now, 1));
  const nextWeek = formatLocalYmd(addLocalDays(now, 7));

  const presetEntries: Array<{
    value: string;
    label: string;
    searchTerms?: string;
  }> = [
    { value: today, label: "Today", searchTerms: "today" },
    { value: tomorrow, label: "Tomorrow", searchTerms: "tomorrow" },
    { value: nextWeek, label: "In one week", searchTerms: "week 7 days" },
  ];

  const current = (currentDueDate ?? "").trim().slice(0, 10);
  if (current && !presetEntries.some((entry) => entry.value === current)) {
    presetEntries.unshift({
      value: current,
      label: formatTaskDueMetaLabel(current) ?? current,
      searchTerms: current,
    });
  }

  const result: SearchableDropdownOption[] = presetEntries.map(
    (entry, index) => ({
      ...entry,
      shortcut: searchableDropdownShortcut(index),
    }),
  );

  result.push({
    value: TASK_PICK_DUE_DATE_VALUE,
    label: "Pick a date…",
    shortcut: searchableDropdownShortcut(result.length),
    searchTerms: "custom calendar pick choose date",
  });

  if (allowClear) {
    result.push({
      value: TASK_NO_DUE_DATE_VALUE,
      label: noDueDateLabel,
      shortcut: searchableDropdownShortcut(result.length),
      searchTerms: "none clear remove",
    });
  }

  return result;
}
