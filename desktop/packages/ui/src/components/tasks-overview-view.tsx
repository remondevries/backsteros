"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { groupTasksByStatus } from "../group-tasks-by-status.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../task-status.js";
import {
  taskGroupAppendOrderKey,
  taskOrderKey,
  type TaskReorderRequest,
} from "../task-list-drag.js";
import {
  applyOptimisticTaskReorder,
  taskReorderPatches,
} from "../task-reorder.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerReorderRequest,
} from "../use-grouped-list-pointer-reorder.js";
import { useListMultiSelect } from "../use-list-multi-select.js";
import {
  DEFAULT_TASKS_DUE_FILTER,
  filterTasksByDueFilter,
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "../tasks-due-filters.js";
import {
  computeTaskDisplayIdColumnCh,
  taskIdColumnCssVars,
} from "../task-id-column-width.js";
import { useOptimisticTaskList } from "../use-optimistic-task-list.js";
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
  TaskBulkEditBar,
  type TaskBulkPatch,
} from "./task-bulk-edit-bar.js";
import {
  TaskItemRow,
  type TaskItemRowTask,
} from "./task-item-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TasksOverviewViewProps = {
  tasks: TaskItemRowTask[];
  onSelectTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /** Soft-delete all currently selected tasks (bulk trash). */
  onBulkDelete?: (taskIds: string[]) => void | Promise<void>;
  /** Persist list/board drag-reorder (status + sortOrder cascade on host). */
  onReorder?: (request: TaskReorderRequest) => void;
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
  /** Optional trailing content beside the task title (e.g. agent bound badge). */
  renderTaskTitleTrailing?: (task: TaskItemRowTask) => ReactNode;
  /** When true for a task, its status icon becomes the agent-working pulse. */
  isTaskAgentWorking?: (task: TaskItemRowTask) => boolean;
  /**
   * Fixed monospace width (in `ch`) for the task-id column.
   * Prefer the global max across all workspace tasks so due filters do not
   * resize the column.
   */
  taskIdColumnCh?: number;
};

export function TasksOverviewView({
  tasks,
  onSelectTask,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
  onBulkDelete,
  onReorder,
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
  renderTaskTitleTrailing,
  isTaskAgentWorking,
  taskIdColumnCh: taskIdColumnChProp,
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
  const { tasks: optimisticTasks, patchTask } = useOptimisticTaskList(tasks);
  const [localTasks, setLocalTasks] = useState(optimisticTasks);
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorder);
  const taskIdColumnCh = useMemo(
    () => taskIdColumnChProp ?? computeTaskDisplayIdColumnCh(tasks),
    [taskIdColumnChProp, tasks],
  );
  const taskIdColumnStyle = useMemo(
    () => taskIdColumnCssVars(taskIdColumnCh),
    [taskIdColumnCh],
  );

  useEffect(() => {
    setLocalTasks(optimisticTasks);
  }, [optimisticTasks]);

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    patchTask(taskId, { status });
    setLocalTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );
    onStatusChange?.(taskId, status);
  };

  const handlePriorityChange = (taskId: string, priority: number) => {
    patchTask(taskId, { priority });
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, priority } : task,
      ),
    );
    onPriorityChange?.(taskId, priority);
  };

  const handleDueDateChange = (taskId: string, dueDate: Date | null) => {
    patchTask(taskId, { dueDate: dueDate ? dueDate.getTime() : null });
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
    patchTask(taskId, {
      projectKey,
      projectName: option?.label ?? null,
    });
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, projectKey, projectName: option?.label ?? null }
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
    const ownerInitials = option?.label
      ?.split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2);
    patchTask(taskId, {
      assigneeId,
      ownerInitials,
    });
    setLocalTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, assigneeId, ownerInitials }
          : task,
      ),
    );
    onAssigneeChange?.(taskId, assigneeId);
  };

  const handleTaskReorder = useCallback(
    (request: TaskReorderRequest) => {
      setLocalTasks((current) => {
        for (const patch of taskReorderPatches(current, request)) {
          patchTask(patch.id, {
            status: patch.status,
            sortOrder: patch.sortOrder,
          });
        }
        return applyOptimisticTaskReorder(current, request);
      });
      if (request.fromStatus !== request.toStatus) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(request.toStatus);
          return next;
        });
      }
      onReorder?.(request);
    },
    [onReorder, patchTask],
  );

  const handlePointerReorder = useCallback(
    (request: GroupedListPointerReorderRequest) => {
      handleTaskReorder({
        taskId: request.itemId,
        fromStatus: migrateLegacyTaskStatus(request.fromGroupKey),
        toStatus: migrateLegacyTaskStatus(request.toGroupKey),
        beforeTaskId: request.beforeItemId,
      });
    },
    [handleTaskReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const task = localTasks.find((entry) => entry.id === itemId);
      return task ? migrateLegacyTaskStatus(task.status) : undefined;
    },
    [localTasks],
  );

  const {
    draggingItemId,
    insertBeforeKey,
    bindItem,
    bindAppendZone,
    consumeClickSuppression,
  } = useGroupedListPointerReorder({
    enabled: canReorder,
    getItemGroupKey,
    itemOrderKey: taskOrderKey,
    groupAppendOrderKey: (groupKey) =>
      taskGroupAppendOrderKey(migrateLegacyTaskStatus(groupKey)),
    onReorder: handlePointerReorder,
  });

  const selectTask = useCallback(
    (taskId: string) => {
      if (consumeClickSuppression()) return;
      onSelectTask?.(taskId);
    },
    [consumeClickSuppression, onSelectTask],
  );

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
    onNavigate: (taskId) => selectTask(taskId),
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: view === "list" && itemIds.length > 0,
  });

  const {
    selectedIds,
    hasBulkSelection,
    isSelected,
    toggleSelected,
    selectAll,
    clearSelection,
  } = useListMultiSelect(itemIds, {
    selectAllShortcutEnabled: view === "list",
  });

  const selectedTasks = useMemo(
    () => filtered.filter((task) => selectedIds.has(task.id)),
    [filtered, selectedIds],
  );

  const applyBulkPatch = async (patch: TaskBulkPatch) => {
    const ids = [...selectedIds];
    for (const taskId of ids) {
      if (patch.status !== undefined) {
        handleStatusChange(taskId, patch.status);
      }
      if (patch.priority !== undefined) {
        handlePriorityChange(taskId, patch.priority);
      }
      if ("dueDate" in patch) {
        handleDueDateChange(taskId, patch.dueDate ?? null);
      }
      if ("projectKey" in patch) {
        handleProjectChange(taskId, patch.projectKey ?? null);
      }
      if ("assigneeId" in patch) {
        handleAssigneeChange(taskId, patch.assigneeId ?? null);
      }
    }
  };

  const pillItems = TASKS_DUE_FILTERS.map((value) => ({
    value,
    label: getTasksDueFilterLabel(value),
  }));

  const listContent = (
    <ul
      className={[
        "overview-grouped-list",
        hasBulkSelection ? "has-bulk-selection" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      role="list"
      ref={listRef}
      style={taskIdColumnStyle}
      {...listContainerProps}
    >
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.status);
        const appendKey = taskGroupAppendOrderKey(group.status);
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
            pointerReorderAppend={
              canReorder ? bindAppendZone(group.status) : null
            }
            showPointerAppendIndicator={insertBeforeKey === appendKey}
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
              <TaskItemRow
                key={task.id}
                task={task}
                keyboardHighlighted={highlightedId === task.id}
                onSelect={selectTask}
                selected={isSelected(task.id)}
                forceShowCheckbox={hasBulkSelection}
                onToggleSelected={(taskId, _checked, event) =>
                  toggleSelected(taskId, Boolean(event.shiftKey))
                }
                showProject={showProject}
                titleTrailing={renderTaskTitleTrailing?.(task)}
                agentWorking={isTaskAgentWorking?.(task) ?? false}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onDueDateChange={handleDueDateChange}
                onProjectChange={handleProjectChange}
                projectOptions={projectOptions}
                pointerReorderBind={
                  canReorder ? bindItem(task.id, group.status) : null
                }
                dragging={draggingItemId === task.id}
                showDragInsertBefore={
                  insertBeforeKey === taskOrderKey(task.id)
                }
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
      allowSameColumnReorder={canReorder}
      onMoveItem={({ itemId, fromColumnKey, toColumnKey, beforeItemId }) => {
        if (canReorder) {
          handleTaskReorder({
            taskId: itemId,
            fromStatus: fromColumnKey as TaskStatus,
            toStatus: toColumnKey as TaskStatus,
            beforeTaskId: beforeItemId,
          });
          return;
        }
        handleStatusChange(itemId, toColumnKey as TaskStatus);
      }}
      onOpenItem={selectTask}
      renderCard={(task, _columnKey, { keyboardHighlighted: _highlighted }) => (
        <TaskBoardCard
          task={task}
          onOpen={selectTask}
          onStatusChange={(status) => handleStatusChange(task.id, status)}
          onPriorityChange={(priority) =>
            handlePriorityChange(task.id, priority)
          }
          onDueDateChange={(dueDate) => handleDueDateChange(task.id, dueDate)}
          onAssigneeChange={(assigneeId) =>
            handleAssigneeChange(task.id, assigneeId)
          }
          assigneeOptions={assigneeOptions}
          agentWorking={isTaskAgentWorking?.(task) ?? false}
          titleTrailing={renderTaskTitleTrailing?.(task)}
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
        listOverlay={
          hasBulkSelection ? (
            <TaskBulkEditBar
              selectedTasks={selectedTasks}
              showProject={showProject}
              projectOptions={projectOptions}
              assigneeOptions={assigneeOptions}
              onClear={clearSelection}
              onSelectAll={
                selectedIds.size < itemIds.length ? selectAll : undefined
              }
              onApply={applyBulkPatch}
              onDelete={
                onBulkDelete
                  ? async () => {
                      await onBulkDelete([...selectedIds]);
                    }
                  : undefined
              }
            />
          ) : null
        }
      />
    </div>
  );
}
