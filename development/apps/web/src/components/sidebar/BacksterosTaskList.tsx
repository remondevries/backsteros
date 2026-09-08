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

import { isBacksterosInboxDueTask, partitionBacksterosInboxTasks } from "~/backsteros/inboxDue";
import { BacksterosTaskStatusIcon } from "~/backsteros/TaskStatusIcon";
import { useBacksterosDisplayedWorkingTaskIds } from "~/backsteros/useBacksterosAgentPresence";
import {
  taskSortOrderPatchesForGroup,
  type BacksterosTaskSortPatch,
} from "~/backsteros/task-reorder";
import {
  groupBacksterosTasksByStatus,
  migrateBacksterosTaskStatus,
  type BacksterosTaskStatus,
} from "~/backsteros/taskStatus";
import type { BacksterosTask } from "~/backsteros/types";
import type { BacksterosProjectTasksState } from "~/backsteros/useBacksterosProjectTasks";
import { matchesBacksterosSearchQuery } from "~/backsteros/searchQuery";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";

const DUE_GROUP_KEY = "due";

type SortableRowBag = {
  readonly setNodeRef: (node: HTMLElement | null) => void;
  readonly style: CSSProperties;
  readonly listeners: ReturnType<typeof useSortable>["listeners"];
  readonly isDragging: boolean;
};

function SortableTaskRowShell(props: {
  readonly id: string;
  readonly disabled: boolean;
  readonly children: (bag: SortableRowBag) => ReactNode;
}) {
  // Skip dnd-kit aria attributes — the row is already a button with its own semantics.
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

function BacksterosTaskRow(props: {
  readonly task: BacksterosTask;
  readonly active: boolean;
  readonly keyboardFocused: boolean;
  readonly working: boolean;
  readonly projectName?: string | null;
  readonly onSelect: (task: BacksterosTask) => void;
  readonly sortable?: SortableRowBag;
}) {
  const { task, active, keyboardFocused, working, projectName, onSelect, sortable } = props;
  return (
    <li ref={sortable?.setNodeRef} style={sortable?.style}>
      <button
        type="button"
        onClick={() => onSelect(task)}
        aria-current={active ? "page" : undefined}
        data-keyboard-nav-item={task.id}
        className={cn(
          "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          active
            ? "bg-sidebar-row-active text-sidebar-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-row-hover",
          keyboardFocused &&
            "bg-primary/10 shadow-[inset_0_0_0_1.5px_var(--primary)] text-sidebar-foreground",
          sortable?.isDragging && "opacity-80 shadow-md",
          sortable?.listeners && "cursor-grab active:cursor-grabbing",
        )}
        {...(sortable?.listeners ?? {})}
      >
        <BacksterosTaskStatusIcon
          status={task.status}
          size={14}
          working={working}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{task.title}</span>
          {projectName ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {projectName}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function BacksterosTaskStatusGroup(props: {
  readonly groupKey: string;
  readonly label: string;
  readonly tasks: readonly BacksterosTask[];
  readonly collapsed: boolean;
  readonly reorderEnabled: boolean;
  readonly activeTaskId: string | null;
  readonly keyboardFocusTaskId: string | null;
  readonly workingTaskIds: ReadonlySet<string>;
  readonly projectNameById?: ReadonlyMap<string, string>;
  readonly onToggle: () => void;
  readonly onSelectTask: (task: BacksterosTask) => void;
  readonly onReorderWithinGroup: (
    groupKey: string,
    orderedTasks: readonly BacksterosTask[],
  ) => void;
}) {
  const {
    groupKey,
    label,
    tasks,
    collapsed,
    reorderEnabled,
    activeTaskId,
    keyboardFocusTaskId,
    workingTaskIds,
    projectNameById,
    onToggle,
    onSelectTask,
    onReorderWithinGroup,
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
      onReorderWithinGroup(groupKey, arrayMove([...tasks], fromIndex, toIndex));
    },
    [canReorder, groupKey, onReorderWithinGroup, tasks],
  );

  return (
    <li className="flex flex-col gap-px">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
      >
        <span className="min-w-0 flex-1 truncate normal-case tracking-normal">{label}</span>
        <span className="tabular-nums text-muted-foreground/70">{tasks.length}</span>
        <ChevronDownIcon
          className={cn("size-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")}
          aria-hidden
        />
      </button>
      {collapsed ? null : canReorder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <ul role="list" className="flex flex-col gap-px" aria-label={`${label} tasks`}>
              {tasks.map((task) => (
                <SortableTaskRowShell key={task.id} id={task.id} disabled={false}>
                  {(bag) => (
                    <BacksterosTaskRow
                      task={task}
                      active={activeTaskId === task.id}
                      keyboardFocused={keyboardFocusTaskId === task.id}
                      working={workingTaskIds.has(task.id)}
                      projectName={
                        task.projectId && projectNameById
                          ? (projectNameById.get(task.projectId) ?? null)
                          : null
                      }
                      onSelect={onSelectTask}
                      sortable={bag}
                    />
                  )}
                </SortableTaskRowShell>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul role="list" className="flex flex-col gap-px">
          {tasks.map((task) => (
            <BacksterosTaskRow
              key={task.id}
              task={task}
              active={activeTaskId === task.id}
              keyboardFocused={keyboardFocusTaskId === task.id}
              working={workingTaskIds.has(task.id)}
              projectName={
                task.projectId && projectNameById
                  ? (projectNameById.get(task.projectId) ?? null)
                  : null
              }
              onSelect={onSelectTask}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BacksterosTaskList(props: {
  readonly state: BacksterosProjectTasksState;
  readonly onRetry: () => void;
  readonly activeTaskId: string | null;
  /** j/k cursor — primary outline while this list owns keyboard focus. */
  readonly keyboardFocusTaskId?: string | null;
  readonly searchQuery?: string;
  readonly emptyLabel?: string;
  readonly statusFilter?: ReadonlySet<BacksterosTaskStatus>;
  /** When true, due today/overdue tasks get a separate "Due" group at the bottom. */
  readonly showDueGroup?: boolean;
  readonly projectNameById?: ReadonlyMap<string, string>;
  readonly onSelectTask: (task: BacksterosTask) => void;
  readonly onReorderTasks?: (patches: readonly BacksterosTaskSortPatch[]) => void;
}) {
  const {
    state,
    onRetry,
    activeTaskId,
    keyboardFocusTaskId = null,
    searchQuery = "",
    emptyLabel = "No tasks yet",
    statusFilter,
    showDueGroup = false,
    projectNameById,
    onSelectTask,
    onReorderTasks,
  } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const isSearching = searchQuery.trim().length > 0;
  const reorderEnabled = Boolean(onReorderTasks) && !isSearching;
  const workingTaskIds = useBacksterosDisplayedWorkingTaskIds();

  const filteredTasks = useMemo(() => {
    if (state.status !== "ready") return [];
    let tasks = state.tasks;
    if (statusFilter) {
      tasks = tasks.filter((task) => {
        const status = migrateBacksterosTaskStatus(task.status);
        if (statusFilter.has(status)) return true;
        return showDueGroup && isBacksterosInboxDueTask(task);
      });
    }
    if (!isSearching) return tasks;
    return tasks.filter((task) => {
      const projectName =
        task.projectId && projectNameById ? (projectNameById.get(task.projectId) ?? "") : "";
      return matchesBacksterosSearchQuery([task.title, task.number, projectName], searchQuery);
    });
  }, [isSearching, projectNameById, searchQuery, showDueGroup, state, statusFilter]);

  const groups = useMemo(() => {
    if (!showDueGroup) {
      return groupBacksterosTasksByStatus(filteredTasks).map((group) => ({
        key: group.status,
        label: group.label,
        tasks: group.tasks,
      }));
    }

    const { attentionTasks, dueTasks } = partitionBacksterosInboxTasks(filteredTasks);
    const statusGroups = groupBacksterosTasksByStatus(attentionTasks).map((group) => ({
      key: group.status,
      label: group.label,
      tasks: group.tasks,
    }));
    if (dueTasks.length === 0) return statusGroups;
    return [...statusGroups, { key: DUE_GROUP_KEY, label: "Due", tasks: dueTasks }];
  }, [filteredTasks, showDueGroup]);

  const handleReorderWithinGroup = useCallback(
    (_groupKey: string, orderedTasks: readonly BacksterosTask[]) => {
      onReorderTasks?.(taskSortOrderPatchesForGroup(orderedTasks));
    },
    [onReorderTasks],
  );

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-muted-foreground/60">
        <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
        <span>Loading tasks…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 px-3 py-8 text-center text-xs text-muted-foreground">
        <p className="max-w-[18rem] text-balance">{state.message}</p>
        <Button type="button" size="xs" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.tasks.length === 0 || filteredTasks.length === 0) {
    if (isSearching) {
      return (
        <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
          No tasks found
        </p>
      );
    }
    return (
      <div className="px-2 py-8 text-center text-xs text-muted-foreground/60">{emptyLabel}</div>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-2 px-1 pb-2">
      {groups.map((group) => (
        <BacksterosTaskStatusGroup
          key={group.key}
          groupKey={group.key}
          label={group.label}
          tasks={group.tasks}
          collapsed={!isSearching && collapsed.has(group.key)}
          reorderEnabled={reorderEnabled}
          activeTaskId={activeTaskId}
          keyboardFocusTaskId={keyboardFocusTaskId}
          workingTaskIds={workingTaskIds}
          projectNameById={projectNameById}
          onSelectTask={onSelectTask}
          onReorderWithinGroup={handleReorderWithinGroup}
          onToggle={() =>
            setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(group.key)) next.delete(group.key);
              else next.add(group.key);
              return next;
            })
          }
        />
      ))}
    </ul>
  );
}
