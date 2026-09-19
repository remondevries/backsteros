"use client";

import {
  formatTimetrackingHumanDuration,
  sumBreakdownSeconds,
  type TimetrackingBreakdownSlice,
} from "../../calendar/calendar-timetracking-breakdown.js";

export type TimetrackingAreaBreakdownProps = {
  slices: readonly TimetrackingBreakdownSlice[];
  className?: string;
  emptyMessage?: string;
};

/**
 * Segmented bar + legend: tracked time by Area (via project → area).
 */
export function TimetrackingAreaBreakdown({
  slices,
  className,
  emptyMessage = "No areas with tracked time in this period.",
}: TimetrackingAreaBreakdownProps) {
  const totalSeconds = sumBreakdownSeconds(slices);
  const visible = slices.filter((slice) => slice.seconds > 0);

  const sectionClass = [
    "calendar-timetracking-area-breakdown",
    "calendar-timetracking-breakdown",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (visible.length === 0 || totalSeconds <= 0) {
    return (
      <section className={sectionClass} aria-label="Tracked time by area">
        <header className="calendar-timetracking-breakdown__header">
          <h2 className="calendar-timetracking-breakdown__title">Areas</h2>
        </header>
        <p className="calendar-timetracking-breakdown__empty">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className={sectionClass} aria-label="Tracked time by area">
      <header className="calendar-timetracking-breakdown__header">
        <h2 className="calendar-timetracking-breakdown__title">Areas</h2>
        <p className="calendar-timetracking-breakdown__total">
          Total: {formatTimetrackingHumanDuration(totalSeconds)}
        </p>
      </header>

      <div
        className="calendar-timetracking-breakdown__bar"
        role="img"
        aria-label="Area time share"
      >
        {visible.map((slice) => (
          <span
            key={slice.id}
            className="calendar-timetracking-breakdown__bar-segment"
            style={{
              flex: `${slice.seconds} 1 0`,
              background: slice.color,
            }}
            title={`${slice.label}: ${formatTimetrackingHumanDuration(slice.seconds)}`}
          />
        ))}
      </div>

      <ul className="calendar-timetracking-breakdown__legend" role="list">
        {visible.map((slice) => (
          <li
            key={slice.id}
            className="calendar-timetracking-breakdown__legend-item"
          >
            <span
              className="calendar-timetracking-breakdown__swatch"
              style={{ background: slice.color }}
              aria-hidden
            />
            <span className="calendar-timetracking-breakdown__legend-copy">
              <span className="calendar-timetracking-breakdown__legend-label">
                {slice.label}
              </span>
              <span className="calendar-timetracking-breakdown__legend-value">
                {formatTimetrackingHumanDuration(slice.seconds)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
