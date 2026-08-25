"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from "react";

import { groupTasksByStatus } from "../../tasks/group-tasks-by-status.js";
import { flattenGroupedListItemIds } from "../../list-nav/list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../../tasks/task-status.js";
import {
  taskGroupAppendOrderKey,
  taskOrderKey,
  type TaskReorderRequest,
} from "../../tasks/task-list-drag.js";
import {
  applyOptimisticTaskReorder,
  taskReorderPatches,
} from "../../tasks/task-reorder.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerReorderRequest,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import { useListMultiSelect } from "../../list-nav/use-list-multi-select.js";
import {
  DEFAULT_TASKS_DUE_FILTER,
  filterTasksByDueFilter,
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "../../tasks/tasks-due-filters.js";
import { isHabitLinkedTask } from "../journal/journal-due-tasks-section.js";
import {
  computeTaskDisplayIdColumnCh,
  taskIdColumnCssVars,
} from "../../tasks/task-id-column-width.js";
import { useOptimisticTaskList } from "../../tasks/use-optimistic-task-list.js";
import { AddInboxTaskInline } from "../inbox/add-inbox-task-inline.js";
import { KanbanBoard } from "../list-nav/kanban-board.js";
import {
  ListBoardViewShell,
  type ListBoardView,
} from "../list-nav/list-board-view-shell.js";
import { PillNav } from "../shared/pill-nav.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import {
  OVERVIEW_LIST_VIRTUALIZE_THRESHOLD,
  VirtualizedOverviewList,
  type VirtualizedOverviewRow,
} from "../../list-nav/virtualized-overview-list.js";
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
import {
  TasksTodayHabitsChips,
  type HabitCheckChipItem,
} from "./tasks-today-habits-chips.js";

type TaskVirtualRow =
  | (VirtualizedOverviewRow & {
      kind: "habits";
    })
  | (VirtualizedOverviewRow & {
      kind: "header";
      status: TaskStatus;
      label: string;
      collapsed: boolean;
    })
  | (VirtualizedOverviewRow & {
      kind: "create";
      status: TaskStatus;
    })
  | (VirtualizedOverviewRow & {
      kind: "task";
      task: TaskItemRowTask;
      status: TaskStatus;
    });

export type TasksOverviewViewProps = {
  tasks: TaskItemRowTask[];
  /**
   * Habit day chips shown above Triage on the Today due filter only.
   * Check-off only — not navigable task rows.
   */
  todayHabits?: readonly HabitCheckChipItem[];
  onToggleTodayHabit?: (item: HabitCheckChipItem, checked: boolean) => void;
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
  projectOptions?: import("../dropdowns/searchable-dropdown.js").SearchableDropdownOption<string>[];
  assigneeOptions?: import("../dropdowns/searchable-dropdown.js").SearchableDropdownOption<string>[];
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
  todayHabits = [],
  onToggleTodayHabit,
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

  const handleStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      patchTask(taskId, { status });
      setLocalTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, status } : task,
        ),
      );
      onStatusChange?.(taskId, status);
    },
    [onStatusChange, patchTask],
  );

  const handlePriorityChange = useCallback(
    (taskId: string, priority: number) => {
      patchTask(taskId, { priority });
      setLocalTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, priority } : task,
        ),
      );
      onPriorityChange?.(taskId, priority);
    },
    [onPriorityChange, patchTask],
  );

  const handleDueDateChange = useCallback(
    (taskId: string, dueDate: Date | null) => {
      patchTask(taskId, { dueDate: dueDate ? dueDate.getTime() : null });
      setLocalTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? { ...task, dueDate: dueDate ? dueDate.getTime() : null }
            : task,
        ),
      );
      onDueDateChange?.(taskId, dueDate);
    },
    [onDueDateChange, patchTask],
  );

  const handleProjectChange = useCallback(
    (taskId: string, projectKey: string | null) => {
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
    },
    [onProjectChange, patchTask, projectOptions],
  );

  const handleAssigneeChange = useCallback(
    (taskId: string, assigneeId: string | null) => {
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
    },
    [assigneeOptions, onAssigneeChange, patchTask],
  );

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
    () =>
      filterTasksByDueFilter(
        localTasks.filter((task) => !isHabitLinkedTask(task)),
        filter,
      ),
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

  const useVirtualList = filtered.length >= OVERVIEW_LIST_VIRTUALIZE_THRESHOLD;

  const virtualRows = useMemo((): TaskVirtualRow[] => {
    if (!useVirtualList) return [];
    const rows: TaskVirtualRow[] = [];
    for (const group of groups) {
      const isCollapsed = collapsed.has(group.status);
      if (filter === "today" && group.status === "triage") {
        rows.push({
          key: "habits",
          kind: "habits",
          estimatedSize: 48,
        });
      }
      rows.push({
        key: `header:${group.status}`,
        kind: "header",
        status: group.status,
        label: group.label,
        collapsed: isCollapsed,
        estimatedSize: 36,
      });
      if (isCollapsed) continue;
      if (addingToStatus === group.status && onCreateTask) {
        rows.push({
          key: `create:${group.status}`,
          kind: "create",
          status: group.status,
          estimatedSize: 44,
        });
      }
      for (const task of group.tasks) {
        rows.push({
          key: task.id,
          kind: "task",
          itemId: task.id,
          task,
          status: group.status,
          estimatedSize: 36,
        });
      }
    }
    return rows;
  }, [
    addingToStatus,
    collapsed,
    filter,
    groups,
    onCreateTask,
    useVirtualList,
  ]);

  const renderVirtualRow = useCallback(
    (row: TaskVirtualRow) => {
      if (row.kind === "habits") {
        return (
          <TasksTodayHabitsChips
            items={todayHabits}
            onToggle={onToggleTodayHabit}
          />
        );
      }
      if (row.kind === "header") {
        return (
          <StatusGroupSection
            groupKey={row.status}
            title={row.label}
            collapsed={row.collapsed}
            onToggle={() =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(row.status)) next.delete(row.status);
                else next.add(row.status);
                return next;
              })
            }
            onAdd={
              onCreateTask
                ? () => {
                    setCollapsed((current) => {
                      const next = new Set(current);
                      next.delete(row.status);
                      return next;
                    });
                    setCreateError(null);
                    setAddingToStatus(row.status);
                  }
                : undefined
            }
            pointerReorderAppend={
              canReorder ? bindAppendZone(row.status) : null
            }
            showPointerAppendIndicator={
              insertBeforeKey === taskGroupAppendOrderKey(row.status)
            }
          >
            {null}
          </StatusGroupSection>
        );
      }
      if (row.kind === "create") {
        return (
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
                  const created = await onCreateTask?.({
                    status: row.status,
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
        );
      }
      return (
        <TaskItemRow
          key={row.task.id}
          task={row.task}
          keyboardHighlighted={highlightedId === row.task.id}
          onSelect={selectTask}
          selected={isSelected(row.task.id)}
          forceShowCheckbox={hasBulkSelection}
          onToggleSelected={(taskId, _checked, event) =>
            toggleSelected(taskId, Boolean(event.shiftKey))
          }
          showProject={showProject}
          titleTrailing={renderTaskTitleTrailing?.(row.task)}
          agentWorking={isTaskAgentWorking?.(row.task) ?? false}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onDueDateChange={handleDueDateChange}
          onProjectChange={handleProjectChange}
          projectOptions={projectOptions}
          pointerReorderBind={
            canReorder ? bindItem(row.task.id, row.status) : null
          }
          dragging={draggingItemId === row.task.id}
          showDragInsertBefore={insertBeforeKey === taskOrderKey(row.task.id)}
        />
      );
    },
    [
      bindAppendZone,
      bindItem,
      canReorder,
      createError,
      creating,
      draggingItemId,
      handleDueDateChange,
      handlePriorityChange,
      handleProjectChange,
      handleStatusChange,
      hasBulkSelection,
      highlightedId,
      insertBeforeKey,
      isSelected,
      isTaskAgentWorking,
      onCreateTask,
      onCreatedTask,
      onToggleTodayHabit,
      projectOptions,
      renderTaskTitleTrailing,
      selectTask,
      showProject,
      todayHabits,
      toggleSelected,
    ],
  );

  const listContent = useVirtualList ? (
    <VirtualizedOverviewList
      rows={virtualRows}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      style={taskIdColumnStyle}
      className={hasBulkSelection ? "has-bulk-selection" : undefined}
      renderRow={renderVirtualRow}
    />
  ) : (
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
        const habitsAboveTriage =
          filter === "today" && group.status === "triage" ? (
            <TasksTodayHabitsChips
              items={todayHabits}
              onToggle={onToggleTodayHabit}
            />
          ) : null;
        return (
          <Fragment key={group.status}>
            {habitsAboveTriage}
            <StatusGroupSection
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
          </Fragment>
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
