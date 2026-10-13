"use client";

import { fireHabitCompleteConfetti } from "../../habits/habit-complete-confetti.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { ProjectOcticon } from "../projects/project-octicon.js";

export type JournalHabitDayItem = {
  habitId: string;
  taskId: string;
  title: string;
  icon: string | null;
  checked: boolean;
  /** Lifetime completed day instances for this habit. */
  completedCount: number;
  /** Lifetime missed (canceled) day instances for this habit. */
  missedCount: number;
};

export type JournalHabitsListProps = {
  items: readonly JournalHabitDayItem[];
  onToggle?: (item: JournalHabitDayItem, checked: boolean) => void;
};

/**
 * Journal Habits tab — task-style rows with checkbox, title, and
 * completed/missed counts (not the dashed chips used on Tasks → Today).
 */
export function JournalHabitsList({ items, onToggle }: JournalHabitsListProps) {
  if (items.length === 0) return null;

  return (
    <ul className="journal-habits-list" role="list" aria-label="Habits">
      {items.map((item) => (
        <li
          key={item.taskId}
          className={[
            "journal-habits-list__item",
            item.checked ? "is-checked" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span
            className="journal-habits-list__check"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <PolishedCheckbox
              checked={item.checked}
              disabled={!onToggle}
              ariaLabel={`Mark ${item.title} complete`}
              onCheckedChange={(checked, event) => {
                event.preventDefault();
                event.stopPropagation();
                if (checked) {
                  fireHabitCompleteConfetti(event.currentTarget);
                }
                onToggle?.(item, checked);
              }}
            />
          </span>
          <span className="journal-habits-list__icon" aria-hidden="true">
            <ProjectOcticon icon={item.icon} size={16} />
          </span>
          <span className="journal-habits-list__title">{item.title}</span>
          <span className="journal-habits-list__counts">
            {item.completedCount} completed · {item.missedCount} missed
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Count completed / missed habit day tasks for one habit definition. */
export function countHabitDayOutcomes(
  tasks: readonly { habitId?: string | null; status?: string | null }[],
  habitId: string,
): { completedCount: number; missedCount: number } {
  let completedCount = 0;
  let missedCount = 0;
  for (const task of tasks) {
    if (task.habitId !== habitId) continue;
    if (task.status === "completed") completedCount += 1;
    else if (task.status === "canceled") missedCount += 1;
  }
  return { completedCount, missedCount };
}
