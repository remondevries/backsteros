"use client";

import { ResponsivePie } from "@nivo/pie";
import { useMemo } from "react";

import {
  formatTimetrackingHumanDuration,
  sumBreakdownSeconds,
  type TimetrackingBreakdownSlice,
} from "../../calendar/calendar-timetracking-breakdown.js";
import { FinanceChartTooltip } from "../finance/finance-chart-tooltip.js";
import { FinanceChartEmpty } from "../finance/finance-chart-status.js";

export type TimetrackingProjectPieChartProps = {
  slices: readonly TimetrackingBreakdownSlice[];
  className?: string;
  emptyMessage?: string;
};

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

type PieDatum = {
  id: string;
  label: string;
  value: number;
  color: string;
};

/**
 * Donut breakdown of tracked time by project for the Projects tab.
 */
export function TimetrackingProjectPieChart({
  slices,
  className,
  emptyMessage = "No tracked time by project in this period.",
}: TimetrackingProjectPieChartProps) {
  const totalSeconds = sumBreakdownSeconds(slices);
  const data = useMemo<PieDatum[]>(
    () =>
      slices
        .filter((slice) => slice.seconds > 0)
        .map((slice) => ({
          id: slice.id,
          label: slice.label,
          value: slice.seconds,
          color: slice.color,
        })),
    [slices],
  );

  const sectionClass = [
    "calendar-timetracking-project-pie",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (data.length === 0 || totalSeconds <= 0) {
    return (
      <section className={sectionClass} aria-label="Tracked time by project">
        <header className="calendar-timetracking-breakdown__header">
          <h2 className="calendar-timetracking-breakdown__title">Projects</h2>
        </header>
        <FinanceChartEmpty className="calendar-timetracking-project-pie__empty">
          {emptyMessage}
        </FinanceChartEmpty>
      </section>
    );
  }

  return (
    <section className={sectionClass} aria-label="Tracked time by project">
      <header className="calendar-timetracking-breakdown__header">
        <h2 className="calendar-timetracking-breakdown__title">Projects</h2>
        <p className="calendar-timetracking-breakdown__total">
          Total: {formatTimetrackingHumanDuration(totalSeconds)}
        </p>
      </header>
      <div className="calendar-timetracking-project-pie__body">
        <div className="calendar-timetracking-project-pie__plot">
          <ResponsivePie
            data={data}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            innerRadius={0.58}
            padAngle={1.2}
            cornerRadius={3}
            activeOuterRadiusOffset={4}
            enableArcLabels={false}
            enableArcLinkLabels={false}
            colors={(datum) => String((datum.data as PieDatum).color)}
            borderWidth={0}
            animate
            motionConfig={CHART_MOTION}
            theme={{
              background: "transparent",
              tooltip: {
                container: {
                  background: "transparent",
                  boxShadow: "none",
                  padding: 0,
                },
              },
            }}
            tooltip={({ datum }) => {
              const percent = Math.round(
                (Number(datum.value) / totalSeconds) * 100,
              );
              return (
                <FinanceChartTooltip className="calendar-timetracking-hours-chart__tooltip">
                  <div className="calendar-timetracking-hours-chart__tooltip-title">
                    {datum.label}
                  </div>
                  <div className="calendar-timetracking-hours-chart__tooltip-row">
                    <span
                      className="calendar-timetracking-hours-chart__tooltip-swatch"
                      style={{ background: String(datum.color) }}
                    />
                    <span>{percent}%</span>
                    <strong>
                      {formatTimetrackingHumanDuration(Number(datum.value))}
                    </strong>
                  </div>
                </FinanceChartTooltip>
              );
            }}
          />
        </div>
        <ul className="calendar-timetracking-breakdown__legend" role="list">
          {data.map((slice) => (
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
                  {formatTimetrackingHumanDuration(slice.value)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
