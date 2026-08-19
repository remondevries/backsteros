import type { HabitSortGranularity } from "./habit-month-grid";

export const HABIT_SORT_OPTIONS: ReadonlyArray<{
  value: HabitSortGranularity;
  label: string;
}> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function parseHabitSort(value: unknown): HabitSortGranularity {
  return (
    HABIT_SORT_OPTIONS.find((option) => option.value === value)?.value ??
    "monthly"
  );
}

export function getHabitSortLabel(sort: HabitSortGranularity): string {
  return (
    HABIT_SORT_OPTIONS.find((option) => option.value === sort)?.label ??
    "Monthly"
  );
}
