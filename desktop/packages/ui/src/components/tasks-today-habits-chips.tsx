"use client";

import { fireHabitCompleteConfetti } from "../habits/habit-complete-confetti.js";

export function collapseHabitItemsByHabitId<
  T extends { habitId: string; checked: boolean; title?: string },
>(items: readonly T[]): T[] {
  const byHabit = new Map<string, T>();
  for (const item of items) {
    const existing = byHabit.get(item.habitId);
    if (!existing) {
      byHabit.set(item.habitId, item);
      continue;
    }
    if (item.checked && !existing.checked) {
      byHabit.set(item.habitId, item);
    }
  }
  const byTitle = new Map<string, T>();
  for (const item of byHabit.values()) {
    const titleKey = (item.title ?? "").trim().toLowerCase() || item.habitId;
    const existing = byTitle.get(titleKey);
    if (!existing) {
      byTitle.set(titleKey, item);
      continue;
    }
    if (item.checked && !existing.checked) {
      byTitle.set(titleKey, item);
    }
  }
  return [...byTitle.values()];
}

export type HabitCheckChipItem = {
  habitId: string;
  taskId: string;
  title: string;
  icon: string | null;
  checked: boolean;
};

export type HabitCheckChipsProps = {
  items: readonly HabitCheckChipItem[];
  onToggle?: (item: HabitCheckChipItem, checked: boolean) => void;
  /** Accessible name for the chip group. */
  ariaLabel?: string;
};

/**
 * Dashed habit check chips — checkbox + title only, whole chip toggles.
 * Used on Tasks → Today (journal Habits uses list rows instead).
 */
export function HabitCheckChips({
  items,
  onToggle,
  ariaLabel = "Habits",
}: HabitCheckChipsProps) {
  if (items.length === 0) return null;

  return (
    <ul className="tasks-today-habits__list" role="list" aria-label={ariaLabel}>
      {items.map((item) => (
        <HabitChip key={item.taskId} item={item} onToggle={onToggle} />
      ))}
    </ul>
  );
}

export type TasksTodayHabitsChipsProps = {
  items: readonly HabitCheckChipItem[];
  onToggle?: (item: HabitCheckChipItem, checked: boolean) => void;
};

/** Tasks overview list row wrapper for today's habit chips (above Triage). */
export function TasksTodayHabitsChips({
  items,
  onToggle,
}: TasksTodayHabitsChipsProps) {
  if (items.length === 0) return null;

  return (
    <li className="tasks-today-habits" aria-label="Today's habits">
      <HabitCheckChips items={items} onToggle={onToggle} ariaLabel="Today's habits" />
    </li>
  );
}

function HabitChip({
  item,
  onToggle,
}: {
  item: HabitCheckChipItem;
  onToggle?: (item: HabitCheckChipItem, checked: boolean) => void;
}) {
  const canToggle = Boolean(onToggle);

  return (
    <li className="tasks-today-habits__item">
      <button
        type="button"
        className={[
          "tasks-today-habits__chip",
          item.checked ? "is-checked" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={!canToggle}
        role="checkbox"
        aria-checked={item.checked}
        aria-label={`Mark ${item.title} complete`}
        onClick={(event) => {
          if (!canToggle) return;
          const next = !item.checked;
          if (next) {
            fireHabitCompleteConfetti(event.currentTarget);
          }
          onToggle?.(item, next);
        }}
      >
        <span
          className="md-task-checkbox md-task-checkbox--flush tasks-today-habits__check"
          data-checked={item.checked ? "true" : "false"}
          aria-hidden="true"
        >
          <span className="md-task-checkbox__box">
            {item.checked ? (
              <svg
                className="md-task-checkbox__check"
                viewBox="0 0 16 16"
                width="10"
                height="10"
                aria-hidden="true"
              >
                <path
                  d="M3.5 8.5l2.5 2.5 6.5-6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        </span>
        <span className="tasks-today-habits__title">{item.title}</span>
      </button>
    </li>
  );
}
