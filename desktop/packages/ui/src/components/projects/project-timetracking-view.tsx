"use client";

import { useMemo } from "react";

import {
  projectBudgetForPeriod,
  projectSpendCentsFromTrackedSeconds,
} from "@backsteros/contracts";

import { buildTimetrackingKindBreakdown } from "../../calendar/calendar-timetracking-breakdown.js";
import {
  formatTimetrackingDuration,
  sumTimetrackingDurationSeconds,
  type TimetrackingEntry,
} from "../../calendar/calendar-timetracking-entries.js";
import {
  formatTimetrackingPeriodLabel,
  localWeekKey,
  monthKeyForWeekKey,
  timetrackingWeekPeriod,
  weekKeyForMonthKey,
  type TimetrackingPeriod,
} from "../../calendar/calendar-timetracking-days.js";
import { moneyCentsToInput } from "../../finance/money-input.js";
import type { MeetingListItem } from "../../meetings/meetings.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { CalendarTimetrackingView } from "../calendar/calendar-timetracking-view.js";
import { TimetrackingHoursChart } from "../calendar/timetracking-hours-chart.js";
import { TimetrackingProjectPieChart } from "../calendar/timetracking-project-pie-chart.js";
import {
  FinanceMonthNavigator,
  FinanceWeekNavigator,
  formatMonthLong,
  localMonthKey,
} from "../finance/finance-month-navigator.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { TaskItemRowTask } from "../tasks/task-item-row.js";
import type { TaskStatus } from "../../tasks/task-status.js";

function formatEuroCents(cents: number): string {
  return `€${moneyCentsToInput(cents, { alwaysFraction: true, allowZero: true })}`;
}

export type ProjectTimetrackingRangeMode = "month" | "week";

export type ProjectTimetrackingViewProps = {
  /** Entries already filtered to the selected period. */
  entries: readonly TimetrackingEntry[];
  tasks?: readonly TaskItemRowTask[];
  meetings?: readonly MeetingListItem[];
  /** Active report range — month or ISO week. */
  period: Extract<TimetrackingPeriod, { kind: "month" | "week" }>;
  onPeriodChange: (
    period: Extract<TimetrackingPeriod, { kind: "month" | "week" }>,
  ) => void;
  /** Furthest month the next-arrow may reach (usually current local month). */
  latestMonth?: string;
  /** Furthest week the next-arrow may reach (usually current local week). */
  latestWeek?: string;
  selectedEntryId?: string | null;
  onEntryOpen?: (entry: TimetrackingEntry) => void;
  emptyLabel?: string;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  onTaskStatusChange?: (taskId: string, status: TaskStatus) => void;
  onTaskPriorityChange?: (taskId: string, priority: number) => void;
  onTaskDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onTaskAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onTaskProjectChange?: (taskId: string, projectKey: string | null) => void;
  onTrackedDurationSecondsChange?: (
    entry: TimetrackingEntry,
    seconds: number | null,
  ) => void;
  /** Project hourly rate in euro cents — enables spend in the header. */
  hourlyRateCents?: number | null;
  /** Project budget rows for period comparison. */
  budgets?: ReadonlyArray<{
    period: "monthly" | "weekly" | "quarterly";
    amountCents: number;
  }>;
};

const RANGE_MODE_OPTIONS = [
  { value: "month" as const, label: "Month" },
  { value: "week" as const, label: "Week" },
];

/**
 * Project Timetracking tab — Finance-style month/week navigator, Month|Week
 * toggle, hours chart + kind pie, and the period’s tracked entry list.
 */
export function ProjectTimetrackingView({
  entries,
  tasks = [],
  meetings = [],
  period: periodProp,
  onPeriodChange,
  latestMonth: latestMonthProp,
  latestWeek: latestWeekProp,
  selectedEntryId = null,
  onEntryOpen,
  emptyLabel,
  projectOptions = [],
  assigneeOptions = [],
  onTaskStatusChange,
  onTaskPriorityChange,
  onTaskDueDateChange,
  onTaskAssigneeChange,
  onTaskProjectChange,
  onTrackedDurationSecondsChange,
  hourlyRateCents = null,
  budgets = [],
}: ProjectTimetrackingViewProps) {
  const latestMonth = latestMonthProp ?? localMonthKey();
  const latestWeek = latestWeekProp ?? localWeekKey();

  const period: Extract<TimetrackingPeriod, { kind: "month" | "week" }> =
    useMemo(() => {
      if (periodProp.kind === "week") {
        return timetrackingWeekPeriod(periodProp.weekKey);
      }
      const monthKey =
        periodProp.monthKey && /^\d{4}-\d{2}$/.test(periodProp.monthKey)
          ? periodProp.monthKey
          : latestMonth;
      return {
        kind: "month",
        monthKey,
        monthLabel: formatMonthLong(monthKey),
      };
    }, [latestMonth, periodProp]);

  const rangeMode: ProjectTimetrackingRangeMode =
    period.kind === "week" ? "week" : "month";

  const kindSlices = useMemo(
    () => buildTimetrackingKindBreakdown(entries),
    [entries],
  );
  const totalSeconds = useMemo(
    () => sumTimetrackingDurationSeconds(entries),
    [entries],
  );
  const spendCents = useMemo(
    () => projectSpendCentsFromTrackedSeconds(totalSeconds, hourlyRateCents),
    [hourlyRateCents, totalSeconds],
  );
  const periodBudget = useMemo(
    () => projectBudgetForPeriod(budgets, rangeMode),
    [budgets, rangeMode],
  );
  const periodLabel = formatTimetrackingPeriodLabel(period);
  const rangeNoun = rangeMode === "week" ? "week" : "month";
  const resolvedEmptyLabel =
    emptyLabel ??
    `No tracked time or completed tasks on this project's schedule for ${periodLabel}.`;

  function handleRangeModeChange(next: ProjectTimetrackingRangeMode) {
    if (next === rangeMode) return;
    if (next === "week") {
      const monthKey =
        period.kind === "month" ? period.monthKey : monthKeyForWeekKey(period.weekKey);
      onPeriodChange(timetrackingWeekPeriod(weekKeyForMonthKey(monthKey)));
      return;
    }
    const monthKey =
      period.kind === "week"
        ? monthKeyForWeekKey(period.weekKey)
        : period.monthKey;
    onPeriodChange({
      kind: "month",
      monthKey,
      monthLabel: formatMonthLong(monthKey),
    });
  }

  return (
    <div className="project-timetracking" data-project-timetracking="">
      <header className="project-timetracking__header">
        <h1 className="project-timetracking__title">
          Time report
          {entries.length > 0 ? (
            <span className="project-timetracking__title-total">
              {" "}
              · {formatTimetrackingDuration(totalSeconds)} total
              {spendCents != null ? (
                <>
                  {" "}
                  · {formatEuroCents(spendCents)}
                </>
              ) : null}
            </span>
          ) : null}
        </h1>
      </header>

      <div className="project-timetracking__charts">
        <div className="project-timetracking__chart project-timetracking__chart--hours">
          <TimetrackingHoursChart
            entries={entries}
            period={period}
            hourlyRateCents={hourlyRateCents}
            budgetHours={
              periodBudget &&
              hourlyRateCents != null &&
              hourlyRateCents > 0
                ? periodBudget.amountCents / hourlyRateCents
                : null
            }
          />
        </div>
        <div className="project-timetracking__chart project-timetracking__chart--kind">
          <TimetrackingProjectPieChart
            slices={kindSlices}
            aria-label="Tracked time by type"
            showTitle={false}
            showTotal={false}
            showLegend={false}
            showCenterSummary
            emptyMessage={`No tracked time by type in this ${rangeNoun}.`}
          />
        </div>
      </div>

      <div className="project-timetracking__toolbar">
        {period.kind === "week" ? (
          <FinanceWeekNavigator
            weekKey={period.weekKey}
            latestWeekKey={latestWeek}
            onChange={(weekKey) => onPeriodChange(timetrackingWeekPeriod(weekKey))}
            aria-label="Timetracking week"
            className="project-timetracking__period-nav"
          />
        ) : (
          <FinanceMonthNavigator
            month={period.monthKey}
            latestMonth={latestMonth}
            onChange={(monthKey) =>
              onPeriodChange({
                kind: "month",
                monthKey,
                monthLabel: formatMonthLong(monthKey),
              })
            }
            aria-label="Timetracking month"
            className="project-timetracking__period-nav"
          />
        )}
        <SegmentedPillToggle
          value={rangeMode}
          options={RANGE_MODE_OPTIONS}
          onChange={handleRangeModeChange}
          ariaLabel="Timetracking range"
        />
      </div>

      <div className="project-timetracking__list">
        <CalendarTimetrackingView
          entries={entries}
          chartEntries={entries}
          tasks={tasks}
          meetings={meetings}
          period={period}
          selectedEntryId={selectedEntryId}
          onEntryOpen={onEntryOpen}
          emptyLabel={resolvedEmptyLabel}
          chartTabs={[]}
          showHeader={false}
          showProject={false}
          projectOptions={projectOptions}
          assigneeOptions={assigneeOptions}
          onTaskStatusChange={onTaskStatusChange}
          onTaskPriorityChange={onTaskPriorityChange}
          onTaskDueDateChange={onTaskDueDateChange}
          onTaskAssigneeChange={onTaskAssigneeChange}
          onTaskProjectChange={onTaskProjectChange}
          onTrackedDurationSecondsChange={onTrackedDurationSecondsChange}
        />
      </div>
    </div>
  );
}
