"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
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
  writeTaskDragPayload,
  isTaskListDragActive,
  readTaskDragPayload,
  resolveTaskDropBeforeTask,
  resolveTaskDropOnGroupAppend,
  taskGroupAppendOrderKey,
  taskOrderKey,
  type TaskReorderRequest,
} from "../task-list-drag.js";
import {
  applyOptimisticTaskReorder,
  taskReorderPatches,
} from "../task-reorder.js";
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
  TaskItemRow,
  type TaskItemRowTask,
} from "./task-item-row.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type ProjectTasksWorkbenchViewProps = {
  tasks: TaskItemRowTask[];
  onSelectTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /** Persist list/board drag-reorder (status + sortOrder cascade on host). */
  onReorder?: (request: TaskReorderRequest) => void;
  /** Shown after the task title in list rows (e.g. sync loader). */
  renderTaskTitleTrailing?: (task: TaskItemRowTask) => ReactNode;
  /** Overlay stacked on the list-row assignee avatar (e.g. agent badge). */
  renderAssigneeAccessory?: (task: TaskItemRowTask) => ReactNode;
  /** `inline` = right after the title; `end` = flush right in the title area. */
  titleTrailingAlign?: "inline" | "end";
  showDueMeta?: boolean;
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
 * Project tasks workbench — list/board with drag reorder, assignee, and
 * title trailing slots. Separate from desktop/web `ProjectTasksView`.
 */
export function ProjectTasksWorkbenchView({
  tasks,
  onSelectTask,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onReorder,
  onCreateTask,
  onCreatedTask,
  onAddTask,
  assigneeOptions = [],
  initialView = "list",
  view: controlledView,
  onViewChange,
  selectedTaskId = null,
  renderTaskTitleTrailing,
  renderAssigneeAccessory,
  titleTrailingAlign = "inline",
  showDueMeta = true,
}: ProjectTasksWorkbenchViewProps) {
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
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(
    null,
  );
  const skipNextOpenRef = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorder);

  useEffect(() => {
    setLocalTasks(optimisticTasks);
  }, [optimisticTasks]);

  useEffect(() => {
    if (!draggingTaskId) return;
    document.body.classList.add("app-is-dragging");
    return () => document.body.classList.remove("app-is-dragging");
  }, [draggingTaskId]);

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
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

  const handleTaskDragEnd = useCallback(() => {
    // HTML5 drag often synthesizes a click on the source after drop — skip it.
    skipNextOpenRef.current = true;
    window.setTimeout(() => {
      skipNextOpenRef.current = false;
    }, 100);
    setDraggingTaskId(null);
    setDragInsertBeforeKey(null);
  }, []);

  const selectTask = useCallback(
    (taskId: string) => {
      if (skipNextOpenRef.current) {
        skipNextOpenRef.current = false;
        return;
      }
      onSelectTask?.(taskId);
    },
    [onSelectTask],
  );

  const handleTaskReorder = useCallback(
    (request: TaskReorderRequest) => {
      handleTaskDragEnd();
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
    [handleTaskDragEnd, onReorder, patchTask],
  );

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
    onNavigate: (taskId) => selectTask(taskId),
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
            dragInsertBeforeKey={dragInsertBeforeKey}
            onDragInsertBeforeKey={
              canReorder ? setDragInsertBeforeKey : undefined
            }
            onListDragEnd={canReorder ? handleTaskDragEnd : undefined}
            listDrag={
              canReorder
                ? {
                    appendOrderKey: taskGroupAppendOrderKey(group.status),
                    isActive: isTaskListDragActive,
                    onDrop: (dataTransfer) => {
                      const payload = readTaskDragPayload(dataTransfer);
                      handleTaskDragEnd();
                      if (!payload) return;
                      handleTaskReorder(
                        resolveTaskDropOnGroupAppend({
                          payload,
                          status: group.status,
                        }),
                      );
                    },
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
              <TaskItemRow
                key={task.id}
                task={task}
                keyboardHighlighted={highlightedId === task.id}
                onSelect={selectTask}
                showProject={false}
                showDueMeta={showDueMeta}
                showAssignee
                titleTrailing={renderTaskTitleTrailing?.(task)}
                titleTrailingAlign={titleTrailingAlign}
                assigneeAccessory={renderAssigneeAccessory?.(task)}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onDueDateChange={handleDueDateChange}
                onAssigneeChange={handleAssigneeChange}
                assigneeOptions={assigneeOptions}
                draggable={canReorder}
                showDragInsertBefore={
                  dragInsertBeforeKey === taskOrderKey(task.id)
                }
                onDragStart={(event: DragEvent<HTMLDivElement>) => {
                  writeTaskDragPayload(event.dataTransfer, task);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingTaskId(task.id);
                }}
                onDragEnd={handleTaskDragEnd}
                onDragOver={(event: DragEvent<HTMLLIElement>) => {
                  if (!isTaskListDragActive(event.dataTransfer)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  setDragInsertBeforeKey(taskOrderKey(task.id));
                }}
                onDrop={(event: DragEvent<HTMLLIElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const payload = readTaskDragPayload(event.dataTransfer);
                  handleTaskDragEnd();
                  if (!payload) return;
                  const request = resolveTaskDropBeforeTask({
                    payload,
                    targetTask: task,
                  });
                  if (request) handleTaskReorder(request);
                }}
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
      selectedItemId={selectedTaskId}
      onDragGestureEnd={handleTaskDragEnd}
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
