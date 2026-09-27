"use client";

import { ResponsivePie } from "@nivo/pie";
import { useMemo } from "react";

import {
  formatTimetrackingHumanDuration,
  sumBreakdownSeconds,
  type TimetrackingBreakdownSlice,
} from "../../calendar/calendar-timetracking-breakdown.js";
import { formatTimetrackingDuration } from "../../calendar/calendar-timetracking-entries.js";
import { FinanceChartTooltip } from "../finance/finance-chart-tooltip.js";
import { FinanceChartEmpty } from "../finance/finance-chart-status.js";

export type TimetrackingProjectPieChartProps = {
  slices: readonly TimetrackingBreakdownSlice[];
  className?: string;
  emptyMessage?: string;
  /** Section heading. Defaults to "Projects". */
  title?: string;
  /** Accessible name for the section. */
  "aria-label"?: string;
  /** When false, hides the section heading. */
  showTitle?: boolean;
  /** When false, hides the “Total: …” line under the title. */
  showTotal?: boolean;
  /** When false, hides the color legend beside the donut. */
  showLegend?: boolean;
  /** When true, shows label:duration lines in the donut hole. */
  showCenterSummary?: boolean;
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
  title = "Projects",
  "aria-label": ariaLabel,
  showTitle = true,
  showTotal = true,
  showLegend = true,
  showCenterSummary = false,
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
    showLegend ? null : "calendar-timetracking-project-pie--no-legend",
    showCenterSummary
      ? "calendar-timetracking-project-pie--center-summary"
      : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const sectionAria = ariaLabel ?? `Tracked time by ${title.toLowerCase()}`;
  const showHeader = showTitle || showTotal;

  if (data.length === 0 || totalSeconds <= 0) {
    return (
      <section className={sectionClass} aria-label={sectionAria}>
        {showHeader ? (
          <header className="calendar-timetracking-breakdown__header">
            {showTitle ? (
              <h2 className="calendar-timetracking-breakdown__title">{title}</h2>
            ) : null}
          </header>
        ) : null}
        <FinanceChartEmpty className="calendar-timetracking-project-pie__empty">
          {emptyMessage}
        </FinanceChartEmpty>
      </section>
    );
  }

  return (
    <section className={sectionClass} aria-label={sectionAria}>
      {showHeader ? (
        <header className="calendar-timetracking-breakdown__header">
          {showTitle ? (
            <h2 className="calendar-timetracking-breakdown__title">{title}</h2>
          ) : null}
          {showTotal ? (
            <p className="calendar-timetracking-breakdown__total">
              Total: {formatTimetrackingHumanDuration(totalSeconds)}
            </p>
          ) : null}
        </header>
      ) : null}
      <div className="calendar-timetracking-project-pie__body">
        <div className="calendar-timetracking-project-pie__plot">
          <ResponsivePie
            data={data}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            innerRadius={showCenterSummary ? 0.68 : 0.58}
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
          {showCenterSummary ? (
            <div
              className="calendar-timetracking-project-pie__center"
              aria-hidden
            >
              {data.map((slice) => (
                <div
                  key={slice.id}
                  className="calendar-timetracking-project-pie__center-row"
                >
                  <span className="calendar-timetracking-project-pie__center-label">
                    {slice.label}
                  </span>
                  <span className="calendar-timetracking-project-pie__center-sep">
                    :
                  </span>{" "}
                  <span className="calendar-timetracking-project-pie__center-value">
                    {formatTimetrackingDuration(slice.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {showLegend ? (
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
        ) : null}
      </div>
    </section>
  );
}
