"use client";

import { useMemo, useState } from "react";

import {
  buildDueDateCalendarGrid,
  DUE_DATE_CALENDAR_WEEKDAY_LABELS,
  formatCalendarMonthTitle,
  shiftCalendarMonth,
} from "../due-date-calendar.js";
import { formatLocalYmd, parseYmdLocal } from "../task-due-date.js";

export type DueDateCalendarProps = {
  value: string | null | undefined;
  onSelect: (ymd: string) => void;
  disabled?: boolean;
  /** Initial month to show (defaults to selected date or today). */
  initialMonth?: Date;
};

function initialMonthForValue(
  value: string | null | undefined,
  fallback: Date,
): Date {
  const ymd = (value ?? "").trim().slice(0, 10);
  if (ymd) {
    const parsed = parseYmdLocal(ymd);
    if (parsed) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
  }
  return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
}

/**
 * Compact month calendar for due-date (and similar) pick flows.
 * Monday-start weeks; matches searchable-dropdown visual language.
 */
export function DueDateCalendar({
  value,
  onSelect,
  disabled = false,
  initialMonth,
}: DueDateCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(
    () => initialMonth ?? initialMonthForValue(value, today),
  );

  const cells = useMemo(
    () => buildDueDateCalendarGrid(month, value, today),
    [month, today, value],
  );
  const title = formatCalendarMonthTitle(month);
  const todayYmd = formatLocalYmd(today);

  return (
    <div className="due-date-calendar" role="group" aria-label="Choose date">
      <div className="due-date-calendar__header">
        <button
          type="button"
          className="due-date-calendar__nav"
          aria-label="Previous month"
          disabled={disabled}
          onClick={() => setMonth((current) => shiftCalendarMonth(current, -1))}
        >
          ‹
        </button>
        <div className="due-date-calendar__title">{title}</div>
        <button
          type="button"
          className="due-date-calendar__nav"
          aria-label="Next month"
          disabled={disabled}
          onClick={() => setMonth((current) => shiftCalendarMonth(current, 1))}
        >
          ›
        </button>
      </div>

      <div className="due-date-calendar__weekdays" aria-hidden="true">
        {DUE_DATE_CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span key={label} className="due-date-calendar__weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="due-date-calendar__grid">
        {cells.map((cell) => (
          <button
            key={cell.ymd}
            type="button"
            className={[
              "due-date-calendar__day",
              cell.inCurrentMonth ? null : "is-outside",
              cell.isToday ? "is-today" : null,
              cell.isSelected ? "is-selected" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            aria-label={cell.ymd}
            aria-current={cell.isToday ? "date" : undefined}
            aria-pressed={cell.isSelected}
            onClick={() => onSelect(cell.ymd)}
          >
            {cell.day}
          </button>
        ))}
      </div>

      <div className="due-date-calendar__footer">
        <button
          type="button"
          className="due-date-calendar__today"
          disabled={disabled}
          onClick={() => {
            onSelect(todayYmd);
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
          }}
        >
          Today
        </button>
      </div>
    </div>
  );
}
