"use client";

import { useMemo, useRef, useState } from "react";

import { groupTasksByStatus } from "../group-tasks-by-status.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../task-status.js";
import { useOptimisticTaskList } from "../use-optimistic-task-list.js";
import { AddInboxTaskInline } from "./add-inbox-task-inline.js";
import { KanbanBoard } from "./kanban-board.js";
import {
  ListBoardViewShell,
  type ListBoardView,
} from "./list-board-view-shell.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "./status-group-section.js";
import { TaskBoardCard } from "./task-board-card.js";
import {
  TaskOverviewRow,
  type TaskOverviewRowTask,
} from "./task-overview-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type ProjectTasksViewProps = {
  tasks: TaskOverviewRowTask[];
  onSelectTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /** Create a task in a status group (Next AddTaskInline). */
  onCreateTask?: (input: {
    status: TaskStatus;
    title: string;
  }) => Promise<{ id: string } | void> | { id: string } | void;
  onCreatedTask?: (taskId: string) => void;
  /** @deprecated Prefer onCreateTask for inline compose. */
  onAddTask?: (status: TaskStatus) => void;
  assigneeOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
  initialView?: ListBoardView;
  view?: ListBoardView;
  onViewChange?: (view: ListBoardView) => void;
  selectedTaskId?: string | null;
};

/**
 * Project Tasks tab — mirrors Next.js ProjectTasksContent:
 * status-grouped list / kanban, List|Board dock, no due-date filter pills.
 */
export function ProjectTasksView({
  tasks,
  onSelectTask,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onCreateTask,
  onCreatedTask,
  onAddTask,
  assigneeOptions = [],
  initialView = "list",
  view: controlledView,
  onViewChange,
  selectedTaskId = null,
}: ProjectTasksViewProps) {
  const [uncontrolledView, setUncontrolledView] =
    useState<ListBoardView>(initialView);
  const view = controlledView ?? uncontrolledView;
  const setView = (next: ListBoardView) => {
    onViewChange?.(next);
    if (controlledView === undefined) {
      setUncontrolledView(next);
    }
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const { tasks: localTasks, patchTask } = useOptimisticTaskList(tasks);
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    patchTask(taskId, { status });
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(status);
      return next;
    });
    onStatusChange?.(taskId, status);
  };

  const handlePriorityChange = (taskId: string, priority: number) => {
    patchTask(taskId, { priority });
    onPriorityChange?.(taskId, priority);
  };

  const handleDueDateChange = (taskId: string, dueDate: Date | null) => {
    patchTask(taskId, { dueDate: dueDate ? dueDate.getTime() : null });
    onDueDateChange?.(taskId, dueDate);
  };

  const handleAssigneeChange = (
    taskId: string,
    assigneeId: string | null,
  ) => {
    const option = assigneeOptions.find(
      (entry) => entry.value === (assigneeId ?? "__none__"),
    );
    patchTask(taskId, {
      assigneeId,
      ownerInitials: option?.label
        ?.split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2),
    });
    onAssigneeChange?.(taskId, assigneeId);
  };

  const groups = useMemo(
    () => groupTasksByStatus(localTasks, { includeEmpty: true }),
    [localTasks],
  );

  const boardColumns = useMemo(
    () =>
      groups.map((group) => ({
        key: group.status,
        label: group.label,
        icon: <TaskStatusIcon status={group.status} size={14} />,
        items: group.tasks,
      })),
    [groups],
  );

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
    enabled: view === "list" && itemIds.length > 0,
  });

  const listContent = (
    <ul
      className="project-tasks-list"
      role="list"
      ref={listRef}
      {...listContainerProps}
    >
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.status);
        return (
          <StatusGroupSection
            key={group.status}
            groupKey={group.status}
            title={group.label}
            collapsed={isCollapsed}
            onToggle={() =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(group.status)) next.delete(group.status);
                else next.add(group.status);
                return next;
              })
            }
            onAdd={
              onCreateTask || onAddTask
                ? () => {
                    setCollapsed((current) => {
                      const next = new Set(current);
                      next.delete(group.status);
                      return next;
                    });
                    setCreateError(null);
                    if (onCreateTask) {
                      setAddingToStatus(group.status);
                    } else {
                      onAddTask?.(group.status);
                    }
                  }
                : undefined
            }
          >
            {addingToStatus === group.status && onCreateTask ? (
              <li className="project-tasks-list__inline-add">
                <AddInboxTaskInline
                  placeholder="Task title"
                  ariaLabel="Task title"
                  disabled={creating}
                  error={createError}
                  onCancel={() => {
                    setAddingToStatus(null);
                    setCreateError(null);
                  }}
                  onSubmit={async (title) => {
                    setCreating(true);
                    setCreateError(null);
                    try {
                      const created = await onCreateTask({
                        status: group.status,
                        title,
                      });
                      setAddingToStatus(null);
                      if (created?.id) onCreatedTask?.(created.id);
                    } catch (error) {
                      setCreateError(
                        error instanceof Error
                          ? error.message
                          : "Could not create task.",
                      );
                    } finally {
                      setCreating(false);
                    }
                  }}
                />
              </li>
            ) : null}
            {group.tasks.map((task) => (
              <TaskOverviewRow
                key={task.id}
                task={task}
                keyboardHighlighted={highlightedId === task.id}
                onSelect={onSelectTask}
                showProject={false}
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

  const boardContent = (
    <KanbanBoard
      columns={boardColumns}
      getItemId={(task) => task.id}
      getItemColumnKey={(task) => migrateLegacyTaskStatus(task.status)}
      compareItems={(left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
      }
      findItemById={(itemId) => localTasks.find((task) => task.id === itemId)}
      onMoveItem={({ itemId, toColumnKey }) => {
        handleStatusChange(itemId, toColumnKey as TaskStatus);
      }}
      onOpenItem={onSelectTask}
      selectedItemId={selectedTaskId}
      renderCard={(task, _columnKey, { keyboardHighlighted: _highlighted }) => (
        <TaskBoardCard
          task={task}
          onOpen={onSelectTask}
          onStatusChange={(status) => handleStatusChange(task.id, status)}
          onPriorityChange={(priority) =>
            handlePriorityChange(task.id, priority)
          }
          onDueDateChange={(dueDate) => handleDueDateChange(task.id, dueDate)}
          onAssigneeChange={(assigneeId) =>
            handleAssigneeChange(task.id, assigneeId)
          }
          assigneeOptions={assigneeOptions}
        />
      )}
    />
  );

  return (
    <div className="project-tasks">
      <ListBoardViewShell
        view={view}
        onViewChange={setView}
        ariaLabel="Task view mode"
        listContent={listContent}
        boardContent={boardContent}
      />
    </div>
  );
}
