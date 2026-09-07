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

import { BacksterosProjectStatusIcon } from "~/backsteros/ProjectStatusIcon";
import {
  projectSortOrderPatchesForGroup,
  type BacksterosProjectSortPatch,
} from "~/backsteros/project-reorder";
import {
  groupBacksterosProjectsByStatus,
  type BacksterosProjectStatus,
} from "~/backsteros/projectStatus";
import type { BacksterosCodebaseProject } from "~/backsteros/types";
import type { BacksterosCodebaseProjectsState } from "~/backsteros/useBacksterosCodebaseProjects";
import { matchesBacksterosSearchQuery } from "~/backsteros/searchQuery";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";

function projectSubtitle(project: BacksterosCodebaseProject): string | null {
  return project.githubRepository ?? project.localWorkingDirectory ?? project.summary;
}

type SortableRowBag = {
  readonly setNodeRef: (node: HTMLElement | null) => void;
  readonly style: CSSProperties;
  readonly listeners: ReturnType<typeof useSortable>["listeners"];
  readonly isDragging: boolean;
};

function SortableProjectRowShell(props: {
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

function BacksterosProjectRow(props: {
  readonly project: BacksterosCodebaseProject;
  readonly selected: boolean;
  readonly keyboardFocused: boolean;
  readonly onSelect: (project: BacksterosCodebaseProject) => void;
  readonly sortable?: SortableRowBag;
}) {
  const { project, selected, keyboardFocused, onSelect, sortable } = props;
  const subtitle = projectSubtitle(project);
  return (
    <li ref={sortable?.setNodeRef} style={sortable?.style}>
      <button
        type="button"
        onClick={() => onSelect(project)}
        aria-current={selected ? "page" : undefined}
        data-keyboard-nav-item={project.id}
        className={cn(
          "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          selected
            ? "bg-sidebar-row-active text-sidebar-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-row-hover",
          keyboardFocused &&
            "bg-primary/10 shadow-[inset_0_0_0_1.5px_var(--primary)] text-sidebar-foreground",
          sortable?.isDragging && "opacity-80 shadow-md",
          sortable?.listeners && "cursor-grab active:cursor-grabbing",
        )}
        {...(sortable?.listeners ?? {})}
      >
        <BacksterosProjectStatusIcon
          status={project.status}
          size={14}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{project.name}</span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function BacksterosStatusGroup(props: {
  readonly status: BacksterosProjectStatus;
  readonly label: string;
  readonly projects: readonly BacksterosCodebaseProject[];
  readonly collapsed: boolean;
  readonly reorderEnabled: boolean;
  readonly selectedProjectId: string | null;
  readonly keyboardFocusProjectId: string | null;
  readonly onToggle: () => void;
  readonly onSelectProject: (project: BacksterosCodebaseProject) => void;
  readonly onReorderWithinStatus: (
    status: BacksterosProjectStatus,
    orderedProjects: readonly BacksterosCodebaseProject[],
  ) => void;
}) {
  const {
    status,
    label,
    projects,
    collapsed,
    reorderEnabled,
    selectedProjectId,
    keyboardFocusProjectId,
    onToggle,
    onSelectProject,
    onReorderWithinStatus,
  } = props;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canReorder = reorderEnabled && projects.length > 1;
  const itemIds = useMemo(() => projects.map((project) => project.id), [projects]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canReorder) return;
      const activeId = String(event.active.id);
      const overId = event.over == null ? null : String(event.over.id);
      if (overId == null || activeId === overId) return;
      const fromIndex = projects.findIndex((project) => project.id === activeId);
      const toIndex = projects.findIndex((project) => project.id === overId);
      if (fromIndex === -1 || toIndex === -1) return;
      onReorderWithinStatus(status, arrayMove([...projects], fromIndex, toIndex));
    },
    [canReorder, onReorderWithinStatus, projects, status],
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
        <span className="tabular-nums text-muted-foreground/70">{projects.length}</span>
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
            <ul role="list" className="flex flex-col gap-px" aria-label={`${label} projects`}>
              {projects.map((project) => (
                <SortableProjectRowShell key={project.id} id={project.id} disabled={false}>
                  {(bag) => (
                    <BacksterosProjectRow
                      project={project}
                      selected={project.id === selectedProjectId}
                      keyboardFocused={project.id === keyboardFocusProjectId}
                      onSelect={onSelectProject}
                      sortable={bag}
                    />
                  )}
                </SortableProjectRowShell>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul role="list" className="flex flex-col gap-px">
          {projects.map((project) => (
            <BacksterosProjectRow
              key={project.id}
              project={project}
              selected={project.id === selectedProjectId}
              keyboardFocused={project.id === keyboardFocusProjectId}
              onSelect={onSelectProject}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BacksterosProjectList(props: {
  readonly state: BacksterosCodebaseProjectsState;
  readonly selectedProjectId?: string | null;
  /** j/k cursor — primary outline while the projects rail owns keyboard focus. */
  readonly keyboardFocusProjectId?: string | null;
  readonly searchQuery?: string;
  readonly onRetry: () => void;
  readonly onSelectProject: (project: BacksterosCodebaseProject) => void;
  readonly onReorderProjects?: (patches: readonly BacksterosProjectSortPatch[]) => void;
}) {
  const {
    state,
    selectedProjectId = null,
    keyboardFocusProjectId = null,
    searchQuery = "",
    onRetry,
    onSelectProject,
    onReorderProjects,
  } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<BacksterosProjectStatus>>(() => new Set());
  const isSearching = searchQuery.trim().length > 0;
  const reorderEnabled = Boolean(onReorderProjects) && !isSearching;

  const filteredProjects = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!isSearching) return state.projects;
    return state.projects.filter((project) =>
      matchesBacksterosSearchQuery(
        [
          project.name,
          project.key,
          project.summary,
          project.githubRepository,
          project.localWorkingDirectory,
        ],
        searchQuery,
      ),
    );
  }, [isSearching, searchQuery, state]);

  const groups = useMemo(
    () => groupBacksterosProjectsByStatus(filteredProjects),
    [filteredProjects],
  );

  const handleReorderWithinStatus = useCallback(
    (_status: BacksterosProjectStatus, orderedProjects: readonly BacksterosCodebaseProject[]) => {
      onReorderProjects?.(projectSortOrderPatchesForGroup(orderedProjects));
    },
    [onReorderProjects],
  );

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-muted-foreground/60">
        <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
        <span>Loading BacksterOS codebases…</span>
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

  if (state.projects.length === 0) {
    return (
      <div className="px-2 py-8 text-center text-xs text-muted-foreground/60">
        No BacksterOS projects with type <span className="font-medium">codebase</span>
      </div>
    );
  }

  if (isSearching && filteredProjects.length === 0) {
    return (
      <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
        No projects found
      </p>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-2 px-1 pb-2">
      {groups.map((group) => (
        <BacksterosStatusGroup
          key={group.status}
          status={group.status}
          label={group.label}
          projects={group.projects}
          collapsed={!isSearching && collapsed.has(group.status)}
          reorderEnabled={reorderEnabled}
          selectedProjectId={selectedProjectId}
          keyboardFocusProjectId={keyboardFocusProjectId}
          onSelectProject={onSelectProject}
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
  );
}
