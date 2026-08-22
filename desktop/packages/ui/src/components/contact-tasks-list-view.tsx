"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { groupTasksByStatus } from "../tasks/group-tasks-by-status.js";
import { flattenGroupedListItemIds } from "../list-nav/list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-nav/list-keyboard-nav-zone.js";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../tasks/task-status.js";
import {
  taskGroupAppendOrderKey,
  taskOrderKey,
  type TaskReorderRequest,
} from "../tasks/task-list-drag.js";
import {
  applyOptimisticTaskReorder,
  taskReorderPatches,
} from "../tasks/task-reorder.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerReorderRequest,
} from "../list-nav/use-grouped-list-pointer-reorder.js";
import { useListMultiSelect } from "../list-nav/use-list-multi-select.js";
import {
  computeTaskDisplayIdColumnCh,
  taskIdColumnCssVars,
} from "../tasks/task-id-column-width.js";
import { useOptimisticTaskList } from "../tasks/use-optimistic-task-list.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "./status-group-section.js";
import {
  TaskBulkEditBar,
  type TaskBulkPatch,
} from "./task-bulk-edit-bar.js";
import {
  TaskItemRow,
  type TaskItemRowTask,
} from "./task-item-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { isHabitLinkedTask } from "./journal-due-tasks-section.js";

export type ContactTasksListViewProps = {
  contactId: string;
  tasks: TaskItemRowTask[];
  onSelectTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  /** Soft-delete all currently selected tasks (bulk trash). */
  onBulkDelete?: (taskIds: string[]) => void | Promise<void>;
  /** Persist list drag-reorder (status + sortOrder cascade on host). */
  onReorder?: (request: TaskReorderRequest) => void;
  selectedTaskId?: string | null;
  emptyMessage?: string;
  emptyHint?: string;
  /**
   * Fixed monospace width (in `ch`) for the task-id column.
   * Prefer the global workspace max; defaults from the unscoped `tasks` prop.
   */
  taskIdColumnCh?: number;
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
  onBulkDelete,
  onReorder,
  selectedTaskId = null,
  emptyMessage = "No tasks for this contact",
  emptyHint = "Tasks assigned to this contact will show up here.",
  taskIdColumnCh: taskIdColumnChProp,
}: ContactTasksListViewProps) {
  const scopedTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !isHabitLinkedTask(task) &&
          (task.assigneeId === contactId || task.contactId === contactId),
      ),
    [contactId, tasks],
  );
  const taskIdColumnCh = useMemo(
    () => taskIdColumnChProp ?? computeTaskDisplayIdColumnCh(tasks),
    [taskIdColumnChProp, tasks],
  );
  const taskIdColumnStyle = useMemo(
    () => taskIdColumnCssVars(taskIdColumnCh),
    [taskIdColumnCh],
  );

  const { tasks: optimisticTasks, patchTask } = useOptimisticTaskList(scopedTasks);
  const [localTasks, setLocalTasks] = useState(optimisticTasks);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorder);

  useEffect(() => {
    setLocalTasks(optimisticTasks);
  }, [optimisticTasks]);

  const handleStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      patchTask(taskId, { status });
      setLocalTasks((current) =>
        current.map((task) => (task.id === taskId ? { ...task, status } : task)),
      );
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(status);
        return next;
      });
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

  const groups = useMemo(
    () => groupTasksByStatus(localTasks, { includeEmpty: true }),
    [localTasks],
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
    enabled: itemIds.length > 0,
  });

  const {
    selectedIds,
    hasBulkSelection,
    isSelected,
    toggleSelected,
    selectAll,
    clearSelection,
  } = useListMultiSelect(itemIds);

  const selectedTasks = useMemo(
    () => localTasks.filter((task) => selectedIds.has(task.id)),
    [localTasks, selectedIds],
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
    }
  };

  if (localTasks.length === 0) {
    return (
      <div className="contact-tasks-list__empty">
        <h2 className="contact-tasks-list__empty-title">{emptyMessage}</h2>
        <p className="contact-tasks-list__empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="contact-tasks-list-host">
      <ul
        className={[
          "contact-tasks-list",
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
              pointerReorderAppend={
                canReorder ? bindAppendZone(group.status) : null
              }
              showPointerAppendIndicator={insertBeforeKey === appendKey}
            >
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
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onDueDateChange={handleDueDateChange}
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
      {hasBulkSelection ? (
        <TaskBulkEditBar
          selectedTasks={selectedTasks}
          showProject={false}
          showAssignee={false}
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
      ) : null}
    </div>
  );
}
