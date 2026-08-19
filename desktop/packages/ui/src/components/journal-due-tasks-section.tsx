"use client";

import { useMemo, useRef, useState } from "react";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "../document-editor-theme.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import { groupTasksByStatus } from "../group-tasks-by-status.js";
import {
  computeTaskDisplayIdColumnCh,
  taskIdColumnCssVars,
} from "../task-id-column-width.js";
import { getTaskDueDateYmd } from "../tasks-due-filters.js";
import type { TaskStatus } from "../task-status.js";
import { useListMultiSelect } from "../use-list-multi-select.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import type { JournalHabitDayItem } from "./journal-habits-section.js";
import { JournalHabitsList } from "./journal-habits-section.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import { StatusGroupSection } from "./status-group-section.js";
import {
  TaskItemRow,
  type TaskItemRowTask,
} from "./task-item-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type JournalDayListMode = "tasks" | "habits";

const JOURNAL_DAY_LIST_OPTIONS = [
  { value: "tasks" as const, label: "Tasks" },
  { value: "habits" as const, label: "Habits" },
] as const;

export type JournalDueTasksSectionProps = {
  dateSlug: string;
  tasks: TaskItemRowTask[];
  /** Habit day instances due on this journal date (shown under the Habits tab). */
  habits?: readonly JournalHabitDayItem[];
  isLoading?: boolean;
  calendarTimeZone?: string;
  onSelectTask?: (taskId: string) => void;
  onToggleHabit?: (item: JournalHabitDayItem, checked: boolean) => void;
  /**
   * Fixed monospace width (in `ch`) for the task-id column.
   * Prefer the global workspace max; defaults from the unfiltered `tasks` prop.
   */
  taskIdColumnCh?: number;
};

/** Habit day instances are synced as tasks but shown separately on journal days. */
export function isHabitLinkedTask(task: {
  habitId?: string | null;
}): boolean {
  return Boolean(task.habitId && String(task.habitId).trim());
}

/** Tasks whose due calendar date matches the journal entry `YYYY-MM-DD`. */
export function filterTasksDueOnJournalDate<
  T extends { dueDate: TaskItemRowTask["dueDate"] },
>(tasks: T[], dateSlug: string, calendarTimeZone?: string): T[] {
  return tasks.filter(
    (task) => getTaskDueDateYmd(task.dueDate, calendarTimeZone) === dateSlug,
  );
}

export function JournalDueTasksSection({
  dateSlug,
  tasks: allTasks,
  habits = [],
  isLoading = false,
  calendarTimeZone,
  onSelectTask,
  onToggleHabit,
  taskIdColumnCh: taskIdColumnChProp,
}: JournalDueTasksSectionProps) {
  const [listMode, setListMode] = useState<JournalDayListMode>("tasks");
  const tasks = useMemo(
    () =>
      filterTasksDueOnJournalDate(
        allTasks,
        dateSlug,
        calendarTimeZone,
      ).filter((task) => !isHabitLinkedTask(task)),
    [allTasks, calendarTimeZone, dateSlug],
  );
  const taskIdColumnCh = useMemo(
    () => taskIdColumnChProp ?? computeTaskDisplayIdColumnCh(allTasks),
    [allTasks, taskIdColumnChProp],
  );
  const taskIdColumnStyle = useMemo(
    () => taskIdColumnCssVars(taskIdColumnCh),
    [taskIdColumnCh],
  );
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const groupedTasks = useMemo(
    () => groupTasksByStatus(tasks).filter((group) => group.tasks.length > 0),
    [tasks],
  );
  const showStatusGrouping = groupedTasks.length > 1;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );
  const itemIds = useMemo(
    () =>
      listMode !== "tasks"
        ? []
        : showStatusGrouping
          ? flattenGroupedListItemIds(
              groupedTasks.map((group) => ({
                key: group.status,
                items: group.tasks,
              })),
              collapsedGroups,
              (task) => task.id,
            )
          : tasks.map((task) => task.id),
    [collapsedGroups, groupedTasks, listMode, showStatusGrouping, tasks],
  );

  function toggleGroup(status: TaskStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: null,
    onNavigate: (taskId) => onSelectTask?.(taskId),
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: listMode === "tasks" && itemIds.length > 0,
  });

  const { hasBulkSelection, isSelected, toggleSelected } =
    useListMultiSelect(itemIds);

  return (
    <section
      className="journal-due-tasks-section"
      style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
    >
      <div className="journal-due-tasks-section__heading">
        <SegmentedPillToggle
          value={listMode}
          options={JOURNAL_DAY_LIST_OPTIONS}
          onChange={setListMode}
          ariaLabel="Journal day list"
        />
      </div>

      {listMode === "habits" ? (
        isLoading ? (
          <ul className="journal-due-tasks-section__list" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="journal-detail-skeleton-task">
                <div
                  className="journal-detail-skeleton-block journal-detail-skeleton-task-status"
                  aria-hidden="true"
                />
                <div
                  className="journal-detail-skeleton-block journal-detail-skeleton-task-title"
                  aria-hidden="true"
                />
              </li>
            ))}
          </ul>
        ) : habits.length === 0 ? (
          <p className="journal-due-tasks-section__empty">
            No habits due on this date.
          </p>
        ) : (
          <div className="journal-due-tasks-section__habits">
            <JournalHabitsList items={habits} onToggle={onToggleHabit} />
          </div>
        )
      ) : isLoading ? (
        <ul className="journal-due-tasks-section__list" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="journal-detail-skeleton-task">
              <div
                className="journal-detail-skeleton-block journal-detail-skeleton-task-status"
                aria-hidden="true"
              />
              <div
                className="journal-detail-skeleton-block journal-detail-skeleton-task-title"
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>
      ) : tasks.length === 0 ? (
        <p className="journal-due-tasks-section__empty">
          No tasks due on this date.
        </p>
      ) : (
        <ul
          ref={listRef}
          className={[
            "journal-due-tasks-section__list",
            hasBulkSelection ? "has-bulk-selection" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          role="list"
          style={taskIdColumnStyle}
          {...listContainerProps}
        >
          {showStatusGrouping ? (
            groupedTasks.map((group) => {
              const collapsed = collapsedGroups.has(group.status);

              return (
                <StatusGroupSection
                  key={group.status}
                  groupKey={group.status}
                  title={group.label}
                  icon={
                    <TaskStatusIcon
                      status={group.status}
                      size={14}
                      title={group.label}
                    />
                  }
                  collapsed={collapsed}
                  onToggle={() => toggleGroup(group.status)}
                >
                  {group.tasks.map((task) => (
                    <TaskItemRow
                      key={task.id}
                      task={task}
                      showDueMeta={false}
                      keyboardHighlighted={highlightedId === task.id}
                      onSelect={onSelectTask}
                      selected={isSelected(task.id)}
                      forceShowCheckbox={hasBulkSelection}
                      onToggleSelected={(taskId, _checked, event) =>
                        toggleSelected(taskId, Boolean(event.shiftKey))
                      }
                    />
                  ))}
                </StatusGroupSection>
              );
            })
          ) : (
            tasks.map((task) => (
              <TaskItemRow
                key={task.id}
                task={task}
                showDueMeta={false}
                keyboardHighlighted={highlightedId === task.id}
                onSelect={onSelectTask}
                selected={isSelected(task.id)}
                forceShowCheckbox={hasBulkSelection}
                onToggleSelected={(taskId, _checked, event) =>
                  toggleSelected(taskId, Boolean(event.shiftKey))
                }
              />
            ))
          )}
        </ul>
      )}
    </section>
  );
}
