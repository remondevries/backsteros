"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { groupTasksByStatus } from "../group-tasks-by-status.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../task-status.js";
import {
  DEFAULT_TASKS_DUE_FILTER,
  filterTasksByDueFilter,
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "../tasks-due-filters.js";
import { AddInboxTaskInline } from "./add-inbox-task-inline.js";
import { KanbanBoard } from "./kanban-board.js";
import {
  ListBoardViewShell,
  type ListBoardView,
} from "./list-board-view-shell.js";
import { PillNav } from "./pill-nav.js";
import { StatusGroupSection } from "./status-group-section.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { TaskBoardCard } from "./task-board-card.js";
import {
  TaskOverviewRow,
  type TaskOverviewRowTask,
} from "./task-overview-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TasksOverviewViewProps = {
  tasks: TaskOverviewRowTask[];
  onSelectTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /** Create a task in a status group (Next due-tasks AddInboxTaskInline). */
  onCreateTask?: (input: {
    status: TaskStatus;
    title: string;
  }) => Promise<{ id: string } | void> | { id: string } | void;
  onCreatedTask?: (taskId: string) => void;
  projectOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
  assigneeOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
  /** Hide project chip on rows (project-scoped lists). Default true. */
  showProject?: boolean;
  initialFilter?: TasksDueFilter;
  /** Controlled due filter (URL sync). When set with onFilterChange, pills navigate via host. */
  filter?: TasksDueFilter;
  onFilterChange?: (filter: TasksDueFilter) => void;
  initialView?: ListBoardView;
  /** Controlled list/board view (URL sync). */
  view?: ListBoardView;
  onViewChange?: (view: ListBoardView) => void;
  /** Route-selected task id, used as a j/k anchor (main-list keyboard nav). */
  selectedTaskId?: string | null;
};

export function TasksOverviewView({
  tasks,
  onSelectTask,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
  onCreateTask,
  onCreatedTask,
  projectOptions = [],
  assigneeOptions = [],
  showProject = true,
  initialFilter = DEFAULT_TASKS_DUE_FILTER,
  filter: controlledFilter,
  onFilterChange,
  initialView = "list",
  view: controlledView,
  onViewChange,
  selectedTaskId = null,
}: TasksOverviewViewProps) {
  const [uncontrolledFilter, setUncontrolledFilter] =
    useState<TasksDueFilter>(initialFilter);
  const filter = controlledFilter ?? uncontrolledFilter;
  const setFilter = (next: TasksDueFilter) => {
    onFilterChange?.(next);
    if (controlledFilter === undefined) {
      setUncontrolledFilter(next);
    }
  };
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
  const [localTasks, setLocalTasks] = useState(tasks);
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    setLocalTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );
    onStatusChange?.(taskId, status);
  };

  const handlePriorityChange = (taskId: string, priority: number) => {
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, priority } : task,
      ),
    );
    onPriorityChange?.(taskId, priority);
  };

  const handleDueDateChange = (taskId: string, dueDate: Date | null) => {
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, dueDate: dueDate ? dueDate.getTime() : null }
          : task,
      ),
    );
    onDueDateChange?.(taskId, dueDate);
  };

  const handleProjectChange = (taskId: string, projectKey: string | null) => {
    const option = projectKey
      ? projectOptions.find((entry) => entry.value === projectKey)
      : null;
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              projectKey,
              projectName: option?.label ?? null,
            }
          : task,
      ),
    );
    onProjectChange?.(taskId, projectKey);
  };

  const handleAssigneeChange = (
    taskId: string,
    assigneeId: string | null,
  ) => {
    const option = assigneeOptions.find(
      (entry) => entry.value === (assigneeId ?? "__none__"),
    );
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              assigneeId,
              ownerInitials: option?.label
                ?.split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2),
            }
          : task,
      ),
    );
    onAssigneeChange?.(taskId, assigneeId);
  };

  const filtered = useMemo(
    () => filterTasksByDueFilter(localTasks, filter),
    [localTasks, filter],
  );
  // Next DueTasksList always keeps empty status groups so the chrome stays put.
  const groups = useMemo(
    () => groupTasksByStatus(filtered, { includeEmpty: true }),
    [filtered],
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

  const pillItems = TASKS_DUE_FILTERS.map((value) => ({
    value,
    label: getTasksDueFilterLabel(value),
  }));

  const listContent = (
    <ul
      className="overview-grouped-list"
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
              onCreateTask
                ? () => {
                    setCollapsed((current) => {
                      const next = new Set(current);
                      next.delete(group.status);
                      return next;
                    });
                    setCreateError(null);
                    setAddingToStatus(group.status);
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
                showProject={showProject}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onDueDateChange={handleDueDateChange}
                onProjectChange={handleProjectChange}
                projectOptions={projectOptions}
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
      selectedItemId={selectedTaskId}
    />
  );

  return (
    <div className="tasks-overview">
      <PillNav
        ariaLabel="Task due date"
        items={pillItems}
        value={filter}
        onChange={setFilter}
      />
      <ListBoardViewShell
        view={view}
        onViewChange={setView}
        listContent={listContent}
        boardContent={boardContent}
      />
    </div>
  );
}
