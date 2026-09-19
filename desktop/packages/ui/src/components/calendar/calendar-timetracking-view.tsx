"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  buildTimetrackingAreaBreakdown,
  buildTimetrackingContactBreakdown,
  buildTimetrackingProjectBreakdown,
} from "../../calendar/calendar-timetracking-breakdown.js";
import {
  formatTimetrackingDuration,
  resolveTimetrackingGroupDateYmd,
  sumTimetrackingDurationSeconds,
  withLiveTimetrackingEntries,
  type TimetrackingEntry,
} from "../../calendar/calendar-timetracking-entries.js";
import {
  formatTimetrackingPeriodLabel,
  type TimetrackingPeriod,
} from "../../calendar/calendar-timetracking-days.js";
import { buildTaskListMeetingItem } from "../../meetings/meeting-list-tasks.js";
import type { MeetingListItem } from "../../meetings/meetings.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  isKeyboardNavHighlighted,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { buildTrackedTimerKey } from "../../tracked-timer/tracked-timer-types.js";
import { useTrackedTimerOptional } from "../../tracked-timer/tracked-timer-context.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  TaskItemRow,
  type TaskItemRowTask,
} from "../tasks/task-item-row.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import { TimetrackingAreaBreakdown } from "./timetracking-area-breakdown.js";
import { TimetrackingContactBreakdown } from "./timetracking-contact-breakdown.js";
import { TimetrackingHoursChart } from "./timetracking-hours-chart.js";
import { TimetrackingLeadingStamp } from "./timetracking-leading-stamp.js";
import { TimetrackingProjectPieChart } from "./timetracking-project-pie-chart.js";

export type CalendarTimetrackingViewTab = "timeline" | "projects" | "distribution";

export type CalendarTimetrackingViewProps = {
  entries: readonly TimetrackingEntry[];
  /**
   * Entries for the hours chart. Defaults to `entries`. Pass a wider period
   * (e.g. week) when the list is filtered to a single day.
   */
  chartEntries?: readonly TimetrackingEntry[];
  tasks?: readonly TaskItemRowTask[];
  meetings?: readonly MeetingListItem[];
  /** Contact id → display name for the Related contacts breakdown. */
  contactNames?: ReadonlyMap<string, string> | Record<string, string>;
  /** Contact id → avatar URL for the Related contacts breakdown. */
  contactAvatarSrc?: ReadonlyMap<string, string | null> | Record<string, string | null | undefined>;
  period?: TimetrackingPeriod | null;
  /** @deprecated Prefer `period`. */
  selectedDateYmd?: string | null;
  /** Currently open entry id (task or meeting) for row highlight. */
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
};

const TIMETRACKING_ROW_PROPS = {
  showCheckbox: false,
  chromeOrder: "timetracking" as const,
  dueDatePlacement: "leading" as const,
};

/**
 * Timetracking main pane — tracked totals for the selected schedule day,
 * week, or month (task due date / meeting start).
 *
 * Chart tabs (Timeline / Projects / Distribution) only swap the graph
 * region; the time-entry list always stays below.
 *
 * Live running timers appear in the list with green chrome when the selected
 * period includes today; their live elapsed time is display-only and is not
 * added to period totals. Past days/weeks/months only show historically
 * tracked entries.
 */
export function CalendarTimetrackingView({
  entries,
  chartEntries,
  tasks = [],
  meetings = [],
  contactNames = {},
  contactAvatarSrc = {},
  period = null,
  selectedDateYmd = null,
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
}: CalendarTimetrackingViewProps) {
  const timer = useTrackedTimerOptional();
  const timerTick = timer?.timerTick ?? 0;
  const [activeTab, setActiveTab] =
    useState<CalendarTimetrackingViewTab>("timeline");

  const resolvedPeriod: TimetrackingPeriod | null =
    period ??
    (selectedDateYmd?.trim()
      ? { kind: "day", ymd: selectedDateYmd.trim() }
      : null);

  const tasksById = useMemo(() => {
    const map = new Map<string, TaskItemRowTask>();
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [tasks]);

  const meetingsById = useMemo(() => {
    const map = new Map<string, MeetingListItem>();
    for (const meeting of meetings) map.set(meeting.id, meeting);
    return map;
  }, [meetings]);

  const meetingRowsById = useMemo(() => {
    const map = new Map<string, TaskItemRowTask>();
    for (const meeting of meetings) {
      map.set(meeting.id, buildTaskListMeetingItem(meeting));
    }
    return map;
  }, [meetings]);

  const displayEntries = useMemo(() => {
    void timerTick;
    const liveSources = (timer?.recentTimers ?? [])
      .filter((entry) => entry.isRunning)
      .map((entry) => {
        if (entry.kind === "task") {
          const task = tasksById.get(entry.entityId);
          return {
            id: entry.entityId,
            kind: "task" as const,
            title: entry.title,
            displayId: entry.subtitle,
            href: entry.href,
            groupDateYmd: resolveTimetrackingGroupDateYmd(task?.dueDate),
            trackedDurationSeconds: task?.trackedDurationSeconds ?? 0,
          };
        }
        const meeting = meetingsById.get(entry.entityId);
        return {
          id: entry.entityId,
          kind: "meeting" as const,
          title: entry.title,
          displayId: entry.subtitle,
          href: entry.href,
          groupDateYmd: resolveTimetrackingGroupDateYmd(meeting?.startAt),
          trackedDurationSeconds: meeting?.trackedDurationSeconds ?? 0,
        };
      });
    return withLiveTimetrackingEntries(entries, liveSources, {
      period: resolvedPeriod,
    });
  }, [
    entries,
    meetingsById,
    resolvedPeriod,
    tasksById,
    timer?.recentTimers,
    timerTick,
  ]);

  const breakdownEntries = chartEntries ?? entries;
  const projectSlices = useMemo(
    () => buildTimetrackingProjectBreakdown(entries),
    [entries],
  );
  const contactSlices = useMemo(
    () => buildTimetrackingContactBreakdown(entries, contactNames),
    [contactNames, entries],
  );
  const areaSlices = useMemo(
    () => buildTimetrackingAreaBreakdown(entries),
    [entries],
  );

  const dayTotalSeconds = sumTimetrackingDurationSeconds(displayEntries);
  const periodLabel = resolvedPeriod
    ? formatTimetrackingPeriodLabel(resolvedPeriod)
    : null;
  const resolvedEmptyLabel =
    emptyLabel ??
    (resolvedPeriod
      ? `No tracked time on items scheduled for ${periodLabel}.`
      : "No tracked time yet. Start a timer on a task or meeting.");

  const showAssignee = assigneeOptions.length > 0 && Boolean(onTaskAssigneeChange);

  const listRef = useRef<HTMLUListElement>(null);
  const itemIds = useMemo(
    () => displayEntries.map((entry) => entry.id),
    [displayEntries],
  );
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedEntryId ?? null,
    onNavigate: (itemId) => {
      const entry = displayEntries.find((candidate) => candidate.id === itemId);
      if (entry) onEntryOpen?.(entry);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  return (
    <div
      className="calendar-timetracking-view"
      data-calendar-timetracking-view=""
      data-selected-date={
        resolvedPeriod?.kind === "day" ? resolvedPeriod.ymd : undefined
      }
      data-selected-week={
        resolvedPeriod?.kind === "week" ? resolvedPeriod.weekKey : undefined
      }
      data-selected-month={
        resolvedPeriod?.kind === "month" ? resolvedPeriod.monthKey : undefined
      }
      data-tab={activeTab}
    >
      <header className="calendar-timetracking-view__header">
        <h1 className="calendar-timetracking-view__title">Time entries</h1>
        {resolvedPeriod ? (
          <p className="calendar-timetracking-view__subtitle">
            Scheduled for {periodLabel}
            {displayEntries.length > 0 ? (
              <span className="calendar-timetracking-view__subtitle-note">
                {" "}
                · {formatTimetrackingDuration(dayTotalSeconds)} total
              </span>
            ) : null}
            <span className="calendar-timetracking-view__subtitle-note">
              {" "}
              · by task due date / meeting start
            </span>
          </p>
        ) : (
          <p className="calendar-timetracking-view__subtitle">
            All tasks and meetings with tracked time
          </p>
        )}
      </header>

      <section
        className="calendar-timetracking-view__charts"
        aria-label="Timetracking charts"
      >
        <div
          className="calendar-timetracking-view__tabs"
          role="tablist"
          aria-label="Timetracking chart views"
        >
          <button
            type="button"
            role="tab"
            id="timetracking-tab-timeline"
            aria-selected={activeTab === "timeline"}
            aria-controls="timetracking-panel-timeline"
            className={[
              "calendar-timetracking-view__tab",
              activeTab === "timeline" ? "is-active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveTab("timeline")}
          >
            Timeline
          </button>
          <button
            type="button"
            role="tab"
            id="timetracking-tab-projects"
            aria-selected={activeTab === "projects"}
            aria-controls="timetracking-panel-projects"
            className={[
              "calendar-timetracking-view__tab",
              activeTab === "projects" ? "is-active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveTab("projects")}
          >
            Projects
          </button>
          <button
            type="button"
            role="tab"
            id="timetracking-tab-distribution"
            aria-selected={activeTab === "distribution"}
            aria-controls="timetracking-panel-distribution"
            className={[
              "calendar-timetracking-view__tab",
              activeTab === "distribution" ? "is-active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveTab("distribution")}
          >
            Distribution
          </button>
        </div>

        <div className="calendar-timetracking-view__chart-stage">
          {activeTab === "timeline" ? (
            <div
              id="timetracking-panel-timeline"
              role="tabpanel"
              aria-labelledby="timetracking-tab-timeline"
              className="calendar-timetracking-view__panel"
            >
              {resolvedPeriod ? (
                <TimetrackingHoursChart
                  entries={breakdownEntries}
                  period={resolvedPeriod}
                />
              ) : (
                <p className="calendar-timetracking-view__chart-empty">
                  Select a day, week, or month to see the hours chart.
                </p>
              )}
            </div>
          ) : activeTab === "projects" ? (
            <div
              id="timetracking-panel-projects"
              role="tabpanel"
              aria-labelledby="timetracking-tab-projects"
              className="calendar-timetracking-view__panel"
            >
              <TimetrackingProjectPieChart slices={projectSlices} />
            </div>
          ) : (
            <div
              id="timetracking-panel-distribution"
              role="tabpanel"
              aria-labelledby="timetracking-tab-distribution"
              className="calendar-timetracking-view__panel calendar-timetracking-view__panel--distribution"
            >
              <TimetrackingContactBreakdown
                slices={contactSlices}
                avatarSrcByContactId={contactAvatarSrc}
              />
              <TimetrackingAreaBreakdown slices={areaSlices} />
            </div>
          )}
        </div>
      </section>

      {displayEntries.length === 0 ? (
        <p className="calendar-timetracking-view__empty">{resolvedEmptyLabel}</p>
      ) : (
        <ul
          ref={listRef}
          className="calendar-timetracking-view__list overview-grouped-list"
          aria-label="Time entries"
          {...listContainerProps}
        >
          {displayEntries.map((entry) => {
            const displaySeconds =
              entry.isLive && timer
                ? timer.getElapsedSeconds(
                    buildTrackedTimerKey(entry.kind, entry.id),
                  )
                : entry.trackedDurationSeconds;
            const leadingStamp = (
              <TimetrackingLeadingStamp
                scheduleAt={entry.groupDateYmd}
                trackedDurationSeconds={displaySeconds}
                isLive={Boolean(entry.isLive)}
              />
            );
            const liveClass = entry.isLive ? "is-live-timer" : undefined;
            const keyboardHighlighted = isKeyboardNavHighlighted(
              highlightedId,
              entry.id,
            );

            if (entry.kind === "task") {
              const task = tasksById.get(entry.id);
              const selected = selectedEntryId === entry.id;
              if (!task) {
                return (
                  <TimetrackingFallbackRow
                    key={`${entry.kind}:${entry.id}`}
                    entry={entry}
                    leadingStamp={leadingStamp}
                    selected={selected}
                    keyboardHighlighted={keyboardHighlighted}
                    isLive={Boolean(entry.isLive)}
                    onOpen={() => onEntryOpen?.(entry)}
                  />
                );
              }
              return (
                <TaskItemRow
                  key={`${entry.kind}:${entry.id}`}
                  task={task}
                  selected={selected}
                  keyboardHighlighted={keyboardHighlighted}
                  className={liveClass}
                  onSelect={() => onEntryOpen?.(entry)}
                  {...TIMETRACKING_ROW_PROPS}
                  leadingStamp={leadingStamp}
                  showAssignee={showAssignee}
                  projectOptions={projectOptions}
                  assigneeOptions={assigneeOptions}
                  onStatusChange={onTaskStatusChange}
                  onPriorityChange={onTaskPriorityChange}
                  onDueDateChange={onTaskDueDateChange}
                  onAssigneeChange={onTaskAssigneeChange}
                  onProjectChange={onTaskProjectChange}
                />
              );
            }

            const meetingRow = meetingRowsById.get(entry.id);
            const selected = selectedEntryId === entry.id;
            if (!meetingRow) {
              return (
                <TimetrackingFallbackRow
                  key={`${entry.kind}:${entry.id}`}
                  entry={entry}
                  leadingStamp={leadingStamp}
                  selected={selected}
                  keyboardHighlighted={keyboardHighlighted}
                  isLive={Boolean(entry.isLive)}
                  onOpen={() => onEntryOpen?.(entry)}
                />
              );
            }

            return (
              <TaskItemRow
                key={`${entry.kind}:${entry.id}`}
                task={meetingRow}
                selected={selected}
                keyboardHighlighted={keyboardHighlighted}
                className={liveClass}
                onSelect={() => onEntryOpen?.(entry)}
                {...TIMETRACKING_ROW_PROPS}
                leadingStamp={leadingStamp}
                showAssignee={false}
                projectOptions={projectOptions}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TimetrackingFallbackRow({
  entry,
  leadingStamp,
  selected = false,
  keyboardHighlighted = false,
  isLive = false,
  onOpen,
}: {
  entry: TimetrackingEntry;
  leadingStamp: ReactNode;
  selected?: boolean;
  keyboardHighlighted?: boolean;
  isLive?: boolean;
  onOpen: () => void;
}) {
  return (
    <li
      className={[
        "task-item-row-item",
        isLive ? "is-live-timer" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(entry.id)}
    >
      <div
        role="button"
        tabIndex={0}
        className={[
          "task-item-row",
          keyboardNavListItemClass(keyboardHighlighted),
          selected ? "is-selected" : null,
          isLive ? "is-live-timer" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        {leadingStamp}
        {entry.displayId ? (
          <span className="task-item-row__id">{entry.displayId}</span>
        ) : null}
        <span className="task-item-row__title-wrap">
          <span className="task-item-row__title">{entry.title}</span>
        </span>
      </div>
    </li>
  );
}
