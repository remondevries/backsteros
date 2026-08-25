"use client";

import { useMemo, useRef, type ReactNode } from "react";

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
import { TimetrackingLeadingStamp } from "./timetracking-leading-stamp.js";

export type CalendarTimetrackingViewProps = {
  entries: readonly TimetrackingEntry[];
  tasks?: readonly TaskItemRowTask[];
  meetings?: readonly MeetingListItem[];
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
 * Live running timers appear in the list with green chrome; their live
 * elapsed time is display-only and is not added to period totals.
 */
export function CalendarTimetrackingView({
  entries,
  tasks = [],
  meetings = [],
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
    return withLiveTimetrackingEntries(entries, liveSources);
  }, [entries, meetingsById, tasksById, timer?.recentTimers, timerTick]);

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
