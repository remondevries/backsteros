"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

import { groupProjectsByStatus } from "../group-projects-by-status.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import {
  filterProjectsByArea,
  getProjectAreaFilterLabel,
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_FILTERS,
  type ProjectAreaFilter,
} from "../project-areas.js";
import type { ProjectStatus } from "../project-status.js";
import {
  createProjectDragPayload,
  isProjectListDragActive,
  PROJECT_LIST_DRAG_TYPE,
  projectGroupAppendOrderKey,
  projectOrderKey,
  readProjectDragPayload,
  resolveProjectDropBeforeProject,
  resolveProjectDropOnGroupAppend,
  type ProjectReorderRequest,
} from "../project-list-drag.js";
import { applyOptimisticProjectReorder } from "../project-reorder.js";
import {
  ListBoardViewShell,
  type ListBoardView,
} from "./list-board-view-shell.js";
import { KanbanBoard } from "./kanban-board.js";
import { PillNav } from "./pill-nav.js";
import { ProjectBoardCard } from "./project-board-card.js";
import {
  ProjectOverviewRow,
  ProjectsListHeader,
  type ProjectOverviewRowProject,
} from "./project-overview-row.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { StatusGroupSection } from "./status-group-section.js";
import { AddProjectInline } from "./add-project-inline.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { mapProjectStatusToTaskStatusIcon } from "../project-status-icon-model.js";
import { migrateLegacyProjectStatus } from "../project-status.js";

export type ProjectsOverviewViewProps = {
  projects: ProjectOverviewRowProject[];
  onSelectProject?: (projectKey: string) => void;
  onStatusChange?: (projectId: string, status: ProjectStatus) => void;
  onPriorityChange?: (projectId: string, priority: number) => void;
  onStartDateChange?: (projectId: string, startDate: Date | null) => void;
  onDueDateChange?: (projectId: string, dueDate: Date | null) => void;
  /** Create a project in a status group (Next AddProjectInline). */
  onCreateProject?: (input: {
    status: ProjectStatus;
    name: string;
  }) => Promise<{ id: string; key?: string } | void> | { id: string; key?: string } | void;
  onCreatedProject?: (projectId: string, projectKey?: string) => void;
  /** Persist list drag-reorder (status + sortOrder cascade on host). */
  onReorder?: (request: ProjectReorderRequest) => void;
  initialArea?: ProjectAreaFilter;
  /** Controlled area filter (URL sync). */
  area?: ProjectAreaFilter;
  onAreaChange?: (area: ProjectAreaFilter) => void;
  initialView?: ListBoardView;
  /** Controlled list/board view (URL sync). */
  view?: ListBoardView;
  onViewChange?: (view: ListBoardView) => void;
  /** When false, hide area pills (organization projects screen). Default true. */
  showAreaFilters?: boolean;
  emptyMessage?: string;
  /** Route-selected project id, used as a j/k anchor (main-list keyboard nav). */
  selectedProjectId?: string | null;
};

export function ProjectsOverviewView({
  projects,
  onSelectProject,
  onStatusChange,
  onPriorityChange,
  onStartDateChange,
  onDueDateChange,
  onCreateProject,
  onCreatedProject,
  onReorder,
  initialArea = PROJECT_AREA_FILTER_ALL,
  area: controlledArea,
  onAreaChange,
  initialView = "list",
  view: controlledView,
  onViewChange,
  showAreaFilters = true,
  emptyMessage = "No projects in this area.",
  selectedProjectId = null,
}: ProjectsOverviewViewProps) {
  const [uncontrolledArea, setUncontrolledArea] =
    useState<ProjectAreaFilter>(initialArea);
  const area = controlledArea ?? uncontrolledArea;
  const setArea = (next: ProjectAreaFilter) => {
    onAreaChange?.(next);
    if (controlledArea === undefined) {
      setUncontrolledArea(next);
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
  const [localProjects, setLocalProjects] = useState(projects);
  const [addingToStatus, setAddingToStatus] = useState<ProjectStatus | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(
    null,
  );
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(
    null,
  );
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorder);

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  useEffect(() => {
    if (!draggingProjectId) return;
    document.body.classList.add("app-is-dragging");
    return () => document.body.classList.remove("app-is-dragging");
  }, [draggingProjectId]);

  const handleStatusChange = (projectId: string, status: ProjectStatus) => {
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, status } : project,
      ),
    );
    onStatusChange?.(projectId, status);
  };

  const handlePriorityChange = (projectId: string, priority: number) => {
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, priority } : project,
      ),
    );
    onPriorityChange?.(projectId, priority);
  };

  const handleStartDateChange = (
    projectId: string,
    startDate: Date | null,
  ) => {
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, startDate: startDate ? startDate.getTime() : null }
          : project,
      ),
    );
    onStartDateChange?.(projectId, startDate);
  };

  const handleDueDateChange = (projectId: string, dueDate: Date | null) => {
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, dueDate: dueDate ? dueDate.getTime() : null }
          : project,
      ),
    );
    onDueDateChange?.(projectId, dueDate);
  };

  const handleProjectDragEnd = useCallback(() => {
    setDraggingProjectId(null);
    setDragInsertBeforeKey(null);
  }, []);

  const handleProjectReorder = useCallback(
    (request: ProjectReorderRequest) => {
      handleProjectDragEnd();
      setLocalProjects((current) =>
        applyOptimisticProjectReorder(current, request),
      );
      if (request.fromStatus !== request.toStatus) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(request.toStatus);
          return next;
        });
      }
      onReorder?.(request);
    },
    [handleProjectDragEnd, onReorder],
  );

  const filtered = useMemo(
    () => filterProjectsByArea(localProjects, area),
    [localProjects, area],
  );
  const groups = useMemo(
    () =>
      groupProjectsByStatus(filtered, {
        includeEmpty: Boolean(onCreateProject),
      }),
    [filtered, onCreateProject],
  );

  const boardColumns = useMemo(
    () =>
      groups.map((group) => ({
        key: group.status,
        label: group.label,
        icon: <ProjectStatusIcon status={group.status} size={14} />,
        items: group.projects,
      })),
    [groups],
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.projects })),
        collapsed,
        (project) => project.id,
      ),
    [collapsed, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedProjectId,
    onNavigate: (projectId) => {
      const project = localProjects.find((entry) => entry.id === projectId);
      if (project) onSelectProject?.(project.key);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: view === "list" && itemIds.length > 0,
  });

  const pillItems = PROJECT_AREA_FILTERS.map((value) => ({
    value,
    label: getProjectAreaFilterLabel(value),
  }));

  const showEmpty =
    filtered.length === 0 && !onCreateProject;

  const listContent = showEmpty ? (
    <p className="overview-empty">{emptyMessage}</p>
  ) : (
    <div className="projects-overview-list">
      <ProjectsListHeader />
      <ul
        className="overview-grouped-list"
        role="list"
        ref={listRef}
        {...listContainerProps}
      >
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.status);
          const headerStatus = mapProjectStatusToTaskStatusIcon(
            migrateLegacyProjectStatus(group.status),
          );
          return (
            <StatusGroupSection
              key={group.status}
              groupKey={headerStatus}
              title={group.label}
              collapsed={isCollapsed}
              addActionLabel="project"
              icon={
                <ProjectStatusIcon
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
              onAdd={
                onCreateProject
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
              dragInsertBeforeKey={dragInsertBeforeKey}
              onDragInsertBeforeKey={
                canReorder ? setDragInsertBeforeKey : undefined
              }
              onListDragEnd={canReorder ? handleProjectDragEnd : undefined}
              listDrag={
                canReorder
                  ? {
                      appendOrderKey: projectGroupAppendOrderKey(group.status),
                      isActive: isProjectListDragActive,
                      onDrop: (dataTransfer) => {
                        const payload = readProjectDragPayload(dataTransfer);
                        handleProjectDragEnd();
                        if (!payload) return;
                        handleProjectReorder(
                          resolveProjectDropOnGroupAppend({
                            payload,
                            status: group.status,
                          }),
                        );
                      },
                    }
                  : undefined
              }
            >
              {addingToStatus === group.status && onCreateProject ? (
                <li className="project-tasks-list__inline-add">
                  <AddProjectInline
                    disabled={creating}
                    error={createError}
                    onCancel={() => {
                      setAddingToStatus(null);
                      setCreateError(null);
                    }}
                    onSubmit={async (name) => {
                      setCreating(true);
                      setCreateError(null);
                      try {
                        const created = await onCreateProject({
                          status: group.status,
                          name,
                        });
                        setAddingToStatus(null);
                        if (created?.id) {
                          onCreatedProject?.(created.id, created.key);
                        }
                      } catch (error) {
                        setCreateError(
                          error instanceof Error
                            ? error.message
                            : "Could not create project.",
                        );
                      } finally {
                        setCreating(false);
                      }
                    }}
                  />
                </li>
              ) : null}
              {group.projects.map((project) => (
                <ProjectOverviewRow
                  key={project.id}
                  project={project}
                  keyboardHighlighted={highlightedId === project.id}
                  onSelect={onSelectProject}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onStartDateChange={handleStartDateChange}
                  onDueDateChange={handleDueDateChange}
                  draggable={canReorder}
                  showDragInsertBefore={
                    dragInsertBeforeKey === projectOrderKey(project.id)
                  }
                  onDragStart={(event: DragEvent<HTMLDivElement>) => {
                    event.dataTransfer.setData(
                      PROJECT_LIST_DRAG_TYPE,
                      createProjectDragPayload(project),
                    );
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingProjectId(project.id);
                  }}
                  onDragEnd={handleProjectDragEnd}
                  onDragOver={(event: DragEvent<HTMLLIElement>) => {
                    if (!isProjectListDragActive(event.dataTransfer)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    setDragInsertBeforeKey(projectOrderKey(project.id));
                  }}
                  onDrop={(event: DragEvent<HTMLLIElement>) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const payload = readProjectDragPayload(event.dataTransfer);
                    handleProjectDragEnd();
                    if (!payload) return;
                    const request = resolveProjectDropBeforeProject({
                      payload,
                      targetProject: project,
                    });
                    if (request) handleProjectReorder(request);
                  }}
                />
              ))}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="projects-overview">
      {showAreaFilters ? (
        <PillNav
          ariaLabel="Project area"
          items={pillItems}
          value={area}
          onChange={setArea}
        />
      ) : null}
      <ListBoardViewShell
        view={view}
        onViewChange={setView}
        listContent={listContent}
        boardContent={
          filtered.length === 0 ? (
            <p className="overview-empty">{emptyMessage}</p>
          ) : (
            <KanbanBoard
              columns={boardColumns}
              getItemId={(project) => project.id}
              getItemColumnKey={(project) =>
                migrateLegacyProjectStatus(project.status)
              }
              compareItems={(left, right) =>
                (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
              }
              findItemById={(itemId) =>
                localProjects.find((project) => project.id === itemId)
              }
              onMoveItem={({ itemId, toColumnKey }) => {
                handleStatusChange(itemId, toColumnKey as ProjectStatus);
              }}
              onOpenItem={onSelectProject}
              selectedItemId={selectedProjectId}
              ariaLabel="Projects board"
              renderCard={(
                project,
                _columnKey,
                { keyboardHighlighted: _highlighted },
              ) => (
                <ProjectBoardCard
                  project={project}
                  onOpen={onSelectProject}
                  onStatusChange={(status) =>
                    handleStatusChange(project.id, status)
                  }
                  onPriorityChange={(priority) =>
                    handlePriorityChange(project.id, priority)
                  }
                  onStartDateChange={(startDate) =>
                    handleStartDateChange(project.id, startDate)
                  }
                  onDueDateChange={(dueDate) =>
                    handleDueDateChange(project.id, dueDate)
                  }
                />
              )}
            />
          )
        }
      />
    </div>
  );
}
