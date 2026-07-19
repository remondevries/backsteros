"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { groupTasksByStatus } from "../group-tasks-by-status.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import type { TaskStatus } from "../task-status.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "./status-group-section.js";
import {
  TaskOverviewRow,
  type TaskOverviewRowTask,
} from "./task-overview-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type ContactTasksListViewProps = {
  contactId: string;
  tasks: TaskOverviewRowTask[];
  onSelectTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  selectedTaskId?: string | null;
  emptyMessage?: string;
  emptyHint?: string;
};

/**
 * Contact Tasks tab — status-grouped list filtered to
 * assigneeId === contactId || contactId === contactId (Next ContactTasksList).
 */
export function ContactTasksListView({
  contactId,
  tasks,
  onSelectTask,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  selectedTaskId = null,
  emptyMessage = "No tasks for this contact",
  emptyHint = "Tasks assigned to this contact will show up here.",
}: ContactTasksListViewProps) {
  const scopedTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.assigneeId === contactId || task.contactId === contactId,
      ),
    [contactId, tasks],
  );

  const [localTasks, setLocalTasks] = useState(scopedTasks);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  useEffect(() => {
    setLocalTasks(scopedTasks);
  }, [scopedTasks]);

  const groups = useMemo(() => groupTasksByStatus(localTasks), [localTasks]);

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.tasks })),
        collapsed,
        (task) => task.id,
      ),
    [collapsed, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedTaskId,
    onNavigate: (taskId) => onSelectTask?.(taskId),
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  function handleStatusChange(taskId: string, status: TaskStatus) {
    setLocalTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(status);
      return next;
    });
    onStatusChange?.(taskId, status);
  }

  function handlePriorityChange(taskId: string, priority: number) {
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, priority } : task,
      ),
    );
    onPriorityChange?.(taskId, priority);
  }

  function handleDueDateChange(taskId: string, dueDate: Date | null) {
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, dueDate: dueDate ? dueDate.getTime() : null }
          : task,
      ),
    );
    onDueDateChange?.(taskId, dueDate);
  }

  if (localTasks.length === 0) {
    return (
      <div className="contact-tasks-list__empty">
        <h2 className="contact-tasks-list__empty-title">{emptyMessage}</h2>
        <p className="contact-tasks-list__empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul
      className="contact-tasks-list"
      role="list"
      ref={listRef}
      {...listContainerProps}
    >
      {groups.map((group) => {
        if (group.tasks.length === 0) return null;
        const isCollapsed = collapsed.has(group.status);

        return (
          <StatusGroupSection
            key={group.status}
            groupKey={group.status}
            title={group.label}
            collapsed={isCollapsed}
            icon={
              <TaskStatusIcon
                status={group.status}
                size={14}
                title={group.label}
              />
            }
            onToggle={() =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(group.status)) next.delete(group.status);
                else next.add(group.status);
                return next;
              })
            }
          >
            {group.tasks.map((task) => (
              <TaskOverviewRow
                key={task.id}
                task={task}
                keyboardHighlighted={highlightedId === task.id}
                onSelect={onSelectTask}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onDueDateChange={handleDueDateChange}
              />
            ))}
          </StatusGroupSection>
        );
      })}
    </ul>
  );
}
