import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { getBacksterosTaskDisplayId, type BacksterosTask } from "~/backsteros/types";
import { formatTaskDueMetaLabel, getTaskDueDateUrgency } from "~/backsteros/taskDueDate";
import { getBacksterosTaskPriorityLabel } from "~/backsteros/taskDetailFormat";
import { BacksterosTaskPriorityIcon } from "~/backsteros/TaskPriorityIcon";
import { BacksterosTaskStatusIcon } from "~/backsteros/TaskStatusIcon";
import { groupBacksterosTasksByStatus, type BacksterosTaskStatus } from "~/backsteros/taskStatus";
import { getBacksterosTaskStatusHeaderGradientStyle } from "~/backsteros/taskStatusHeaderGradient";
import {
  taskSortOrderPatchesForGroup,
  type BacksterosTaskSortPatch,
} from "~/backsteros/task-reorder";
import { useBacksterosDisplayedWorkingTaskIds } from "~/backsteros/useBacksterosAgentPresence";
import type { BacksterosProjectTasksState } from "~/backsteros/useBacksterosProjectTasks";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import "~/backsteros/backsterosTasksOverview.css";

const DEFAULT_TASK_ID_COLUMN_CH = 5;
const TASK_ID_COLUMN_CH_SLACK = 1;

function computeTaskIdColumnCh(
  tasks: readonly BacksterosTask[],
  projectKey: string | null | undefined,
): number {
  let max = DEFAULT_TASK_ID_COLUMN_CH;
  for (const task of tasks) {
    const displayId = getBacksterosTaskDisplayId(task, projectKey);
    if (displayId) max = Math.max(max, displayId.length);
  }
  return max + TASK_ID_COLUMN_CH_SLACK;
}

type SortableRowBag = {
  readonly setNodeRef: (node: HTMLElement | null) => void;
  readonly style: CSSProperties;
  readonly listeners: ReturnType<typeof useSortable>["listeners"];
  readonly isDragging: boolean;
};

function SortableOverviewTaskRowShell(props: {
  readonly id: string;
  readonly disabled: boolean;
  readonly children: (bag: SortableRowBag) => ReactNode;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: props.disabled,
  });
  return props.children({
    setNodeRef,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 1 : undefined,
      position: isDragging ? ("relative" as const) : undefined,
    },
    listeners: props.disabled ? undefined : listeners,
    isDragging,
  });
}

function BacksterosOverviewTaskRow(props: {
  readonly task: BacksterosTask;
  readonly projectKey: string | null | undefined;
  readonly selected: boolean;
  readonly keyboardFocused: boolean;
  readonly working: boolean;
  readonly onSelect: (task: BacksterosTask) => void;
  readonly sortable?: SortableRowBag;
}) {
  const { task, projectKey, selected, keyboardFocused, working, onSelect, sortable } = props;
  const displayId = getBacksterosTaskDisplayId(task, projectKey);
  const dueLabel = formatTaskDueMetaLabel(task.dueDate);
  const urgency = getTaskDueDateUrgency(task.dueDate, new Date(), {
    status: task.status,
  });
  const priority = task.priority ?? 0;

  return (
    <li ref={sortable?.setNodeRef} style={sortable?.style} className="bos-task-row-item">
      <button
        type="button"
        onClick={() => onSelect(task)}
        aria-current={selected ? "true" : undefined}
        data-keyboard-nav-item={task.id}
        className={cn(
          "bos-task-row",
          selected && "is-selected",
          keyboardFocused && "is-keyboard-focus",
          sortable?.listeners && "is-draggable",
          sortable?.isDragging && "is-dragging",
        )}
        {...(sortable?.listeners ?? {})}
      >
        <span className="bos-task-row__priority" title={getBacksterosTaskPriorityLabel(priority)}>
          <BacksterosTaskPriorityIcon priority={priority} size={14} />
        </span>
        {displayId ? <span className="bos-task-row__id">{displayId}</span> : null}
        <span className="bos-task-row__status">
          <BacksterosTaskStatusIcon status={task.status} size={14} working={working} />
        </span>
        <span className="bos-task-row__title-wrap">
          <span className="bos-task-row__title">{task.title}</span>
        </span>
        {dueLabel ? (
          <span className="bos-task-row__properties">
            <span
              className={cn("bos-task-row__due", urgency === "overdue" && "is-late")}
              title={dueLabel}
            >
              <span className="bos-task-row__due-label">{dueLabel}</span>
            </span>
          </span>
        ) : null}
      </button>
    </li>
  );
}

function BacksterosOverviewStatusGroup(props: {
  readonly status: BacksterosTaskStatus;
  readonly label: string;
  readonly tasks: readonly BacksterosTask[];
  readonly projectKey: string | null | undefined;
  readonly collapsed: boolean;
  readonly reorderEnabled: boolean;
  readonly selectedTaskId: string | null;
  readonly keyboardFocusTaskId: string | null;
  readonly workingTaskIds: ReadonlySet<string>;
  readonly onToggle: () => void;
  readonly onSelectTask: (task: BacksterosTask) => void;
  readonly onReorderWithinStatus: (
    status: BacksterosTaskStatus,
    orderedTasks: readonly BacksterosTask[],
  ) => void;
}) {
  const {
    status,
    label,
    tasks,
    projectKey,
    collapsed,
    reorderEnabled,
    selectedTaskId,
    keyboardFocusTaskId,
    workingTaskIds,
    onToggle,
    onSelectTask,
    onReorderWithinStatus,
  } = props;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canReorder = reorderEnabled && tasks.length > 1;
  const itemIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canReorder) return;
      const activeId = String(event.active.id);
      const overId = event.over == null ? null : String(event.over.id);
      if (overId == null || activeId === overId) return;
      const fromIndex = tasks.findIndex((task) => task.id === activeId);
      const toIndex = tasks.findIndex((task) => task.id === overId);
      if (fromIndex === -1 || toIndex === -1) return;
      onReorderWithinStatus(status, arrayMove([...tasks], fromIndex, toIndex));
    },
    [canReorder, onReorderWithinStatus, status, tasks],
  );

  return (
    <li className="bos-status-group">
      <div
        data-list-sticky-cover
        className="bos-status-group__header-row"
        style={getBacksterosTaskStatusHeaderGradientStyle(status)}
      >
        <button
          type="button"
          className="bos-status-group__header"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <span className="bos-status-group__toggle" aria-hidden>
            <span className="bos-status-group__icon">
              <BacksterosTaskStatusIcon status={status} size={14} />
            </span>
            <span
              className="bos-status-group__chevron"
              data-expanded={collapsed ? "false" : "true"}
            >
              <ChevronDownIcon className="size-3.5" />
            </span>
          </span>
          <span className="bos-status-group__title">{label}</span>
          <span className="bos-status-group__count">{tasks.length}</span>
        </button>
      </div>
      {collapsed ? null : canReorder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <ul role="list" className="bos-status-group__items" aria-label={`${label} tasks`}>
              {tasks.map((task) => (
                <SortableOverviewTaskRowShell key={task.id} id={task.id} disabled={false}>
                  {(bag) => (
                    <BacksterosOverviewTaskRow
                      task={task}
                      projectKey={projectKey}
                      selected={selectedTaskId === task.id}
                      keyboardFocused={keyboardFocusTaskId === task.id}
                      working={workingTaskIds.has(task.id)}
                      onSelect={onSelectTask}
                      sortable={bag}
                    />
                  )}
                </SortableOverviewTaskRowShell>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul role="list" className="bos-status-group__items">
          {tasks.map((task) => (
            <BacksterosOverviewTaskRow
              key={task.id}
              task={task}
              projectKey={projectKey}
              selected={selectedTaskId === task.id}
              keyboardFocused={keyboardFocusTaskId === task.id}
              working={workingTaskIds.has(task.id)}
              onSelect={onSelectTask}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BacksterosProjectTasksOverview(props: {
  readonly state: BacksterosProjectTasksState;
  readonly projectKey?: string | null;
  readonly selectedTaskId: string | null;
  /** j/k cursor — primary outline while this list owns keyboard focus. */
  readonly keyboardFocusTaskId?: string | null;
  readonly onRetry: () => void;
  readonly onSelectTask: (task: BacksterosTask) => void;
  readonly onReorderTasks?: (patches: readonly BacksterosTaskSortPatch[]) => void;
}) {
  const {
    state,
    projectKey,
    selectedTaskId,
    keyboardFocusTaskId = null,
    onRetry,
    onSelectTask,
    onReorderTasks,
  } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<BacksterosTaskStatus>>(() => new Set());
  const workingTaskIds = useBacksterosDisplayedWorkingTaskIds();
  const reorderEnabled = Boolean(onReorderTasks);

  const groups = useMemo(
    () => (state.status === "ready" ? groupBacksterosTasksByStatus(state.tasks) : []),
    [state],
  );

  const columnStyle = useMemo((): CSSProperties | undefined => {
    if (state.status !== "ready") return undefined;
    return {
      ["--bos-task-id-column-ch" as string]: computeTaskIdColumnCh(state.tasks, projectKey),
    };
  }, [projectKey, state]);

  const handleReorderWithinStatus = useCallback(
    (_status: BacksterosTaskStatus, orderedTasks: readonly BacksterosTask[]) => {
      onReorderTasks?.(taskSortOrderPatchesForGroup(orderedTasks));
    },
    [onReorderTasks],
  );

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="bos-tasks-overview">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
          <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
          Loading tasks…
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bos-tasks-overview">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-xs text-muted-foreground">
          <p className="max-w-[18rem] text-balance">{state.message}</p>
          <Button type="button" size="xs" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (state.tasks.length === 0) {
    return (
      <div className="bos-tasks-overview">
        <p className="bos-tasks-overview__empty">No tasks yet. Create one in the side panel.</p>
      </div>
    );
  }

  return (
    <div className="bos-tasks-overview" style={columnStyle}>
      <div className="bos-tasks-overview__scroll">
        <ul role="list" className="bos-tasks-overview__grouped">
          {groups.map((group) => (
            <BacksterosOverviewStatusGroup
              key={group.status}
              status={group.status}
              label={group.label}
              tasks={group.tasks}
              projectKey={projectKey}
              collapsed={collapsed.has(group.status)}
              reorderEnabled={reorderEnabled}
              selectedTaskId={selectedTaskId}
              keyboardFocusTaskId={keyboardFocusTaskId}
              workingTaskIds={workingTaskIds}
              onSelectTask={onSelectTask}
              onReorderWithinStatus={handleReorderWithinStatus}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.status)) next.delete(group.status);
                  else next.add(group.status);
                  return next;
                })
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
