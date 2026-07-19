"use client";

import { useMemo, useRef, useState } from "react";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "../document-editor-theme.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import { groupTasksByStatus } from "../group-tasks-by-status.js";
import { getTaskDueDateYmd } from "../tasks-due-filters.js";
import type { TaskStatus } from "../task-status.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "./status-group-section.js";
import { TasksNavIcon } from "./sidebar-nav-icons.js";
import {
  TaskOverviewRow,
  type TaskOverviewRowTask,
} from "./task-overview-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type JournalDueTasksSectionProps = {
  dateSlug: string;
  tasks: TaskOverviewRowTask[];
  isLoading?: boolean;
  calendarTimeZone?: string;
  onSelectTask?: (taskId: string) => void;
};

/** Tasks whose due calendar date matches the journal entry `YYYY-MM-DD`. */
export function filterTasksDueOnJournalDate<T extends { dueDate: TaskOverviewRowTask["dueDate"] }>(
  tasks: T[],
  dateSlug: string,
  calendarTimeZone?: string,
): T[] {
  return tasks.filter(
    (task) => getTaskDueDateYmd(task.dueDate, calendarTimeZone) === dateSlug,
  );
}

export function JournalDueTasksSection({
  dateSlug,
  tasks: allTasks,
  isLoading = false,
  calendarTimeZone,
  onSelectTask,
}: JournalDueTasksSectionProps) {
  const tasks = useMemo(
    () =>
      filterTasksDueOnJournalDate(
        allTasks,
        dateSlug,
        calendarTimeZone,
      ),
    [allTasks, calendarTimeZone, dateSlug],
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
      showStatusGrouping
        ? flattenGroupedListItemIds(
            groupedTasks.map((group) => ({
              key: group.status,
              items: group.tasks,
            })),
            collapsedGroups,
            (task) => task.id,
          )
        : tasks.map((task) => task.id),
    [collapsedGroups, groupedTasks, showStatusGrouping, tasks],
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
    enabled: itemIds.length > 0,
  });

  return (
    <section
      className="journal-due-tasks-section"
      style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
    >
      <p className="journal-due-tasks-section__heading">
        <span className="journal-due-tasks-section__heading-icon" aria-hidden="true">
          <TasksNavIcon />
        </span>
        <span>Tasks</span>
      </p>

      {isLoading ? (
        <ul
          className="journal-due-tasks-section__list"
          aria-busy="true"
        >
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
          className="journal-due-tasks-section__list"
          role="list"
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
                    <TaskOverviewRow
                      key={task.id}
                      task={task}
                      showDueMeta={false}
                      keyboardHighlighted={highlightedId === task.id}
                      onSelect={onSelectTask}
                    />
                  ))}
                </StatusGroupSection>
              );
            })
          ) : (
            tasks.map((task) => (
              <TaskOverviewRow
                key={task.id}
                task={task}
                showDueMeta={false}
                keyboardHighlighted={highlightedId === task.id}
                onSelect={onSelectTask}
              />
            ))
          )}
        </ul>
      )}
    </section>
  );
}
