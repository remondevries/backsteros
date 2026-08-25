"use client";

import { fireHabitCompleteConfetti } from "../../habits/habit-complete-confetti.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";

export type CalendarHabitIconItem = {
  habitId: string;
  taskId: string;
  title: string;
  icon: string | null;
  completed: boolean;
  sortOrder?: number;
};

export type CalendarHabitsIconRowProps = {
  items: readonly CalendarHabitIconItem[];
  onToggle?: (item: CalendarHabitIconItem, completed: boolean) => void;
};

/**
 * Small habit icon chips shown at the top of each calendar day column.
 */
export function CalendarHabitsIconRow({
  items,
  onToggle,
}: CalendarHabitsIconRowProps) {
  if (items.length === 0) return null;

  return (
    <div className="calendar-day-habits" aria-label="Habits">
      <ul className="calendar-day-habits__list" role="list">
        {items.map((item) => (
          <li key={item.habitId} className="calendar-day-habits__item">
            <button
              type="button"
              className={[
                "calendar-day-habits__chip",
                item.completed
                  ? "calendar-day-habits__chip--done"
                  : "calendar-day-habits__chip--pending",
              ].join(" ")}
              aria-pressed={item.completed}
              aria-label={
                item.completed
                  ? `${item.title}, done today`
                  : `${item.title}, not done today`
              }
              disabled={!onToggle}
              onClick={(event) => {
                if (!onToggle) return;
                const next = !item.completed;
                if (next) {
                  fireHabitCompleteConfetti(event.currentTarget);
                }
                onToggle(item, next);
              }}
            >
              <span className="calendar-day-habits__icon" aria-hidden="true">
                {item.icon ? (
                  <ProjectOcticon
                    icon={item.icon}
                    size={12}
                    style={{ color: "#0d1117" }}
                  />
                ) : (
                  <DefaultProjectIcon size={12} style={{ color: "#0d1117" }} />
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
