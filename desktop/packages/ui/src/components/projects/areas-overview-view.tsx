"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  groupProjectsByArea,
  projectAreaGroupKey,
  type NestedAreaRef,
  type ProjectAreaGroupKey,
} from "../../projects/group-projects-by-area.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import type { ProjectArea } from "../../projects/project-areas.js";
import { PROJECT_AREA_LABELS } from "../../projects/project-areas.js";
import {
  projectAreaGroupAppendOrderKey,
  projectAreaOrderKey,
  type ProjectAreaReorderRequest,
} from "../../projects/project-area-list-drag.js";
import { applyOptimisticProjectAreaReorder } from "../../projects/project-area-reorder.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerReorderRequest,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import type { ProjectStatus } from "../../projects/project-status.js";
import {
  ListBoardViewShell,
  type ListBoardView,
} from "../list-nav/list-board-view-shell.js";
import { KanbanBoard } from "../list-nav/kanban-board.js";
import { ProjectBoardCard } from "./project-board-card.js";
import {
  ProjectOverviewRow,
  ProjectsListHeader,
  type ProjectOverviewRowProject,
} from "./project-overview-row.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import { AddProjectInline } from "./add-project-inline.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";

export type AreasOverviewViewProps = {
  projects: ProjectOverviewRowProject[];
  /** Custom nested areas under Personal / Business / Clients. */
  areas?: NestedAreaRef[];
  onSelectProject?: (projectKey: string) => void;
  onStatusChange?: (projectId: string, status: ProjectStatus) => void;
  onPriorityChange?: (projectId: string, priority: number) => void;
  onStartDateChange?: (projectId: string, startDate: Date | null) => void;
  onDueDateChange?: (projectId: string, dueDate: Date | null) => void;
  onAreaChange?: (projectId: string, area: ProjectArea | null) => void;
  /** Create a nested area under a parent bucket. */
  onCreateArea?: (input: {
    parent: ProjectArea;
    name: string;
  }) => Promise<{ id: string } | void> | { id: string } | void;
  onCreatedArea?: (areaId: string) => void;
  /**
   * Delete a nested area. Host should reassign projects to the parent bucket
   * (clear areaId, keep area) before soft-deleting.
   */
  onDeleteArea?: (input: {
    areaId: string;
    parent: ProjectArea;
  }) => Promise<void> | void;
  /** Persist list drag-reorder (area + sortOrder cascade on host). */
  onReorder?: (request: ProjectAreaReorderRequest) => void;
  initialView?: ListBoardView;
  view?: ListBoardView;
  onViewChange?: (view: ListBoardView) => void;
  emptyMessage?: string;
  selectedProjectId?: string | null;
  /** Project ids with an active working agent (swap row icon for loader). */
  workingProjectIds?: ReadonlySet<string>;
};

export function AreasOverviewView({
  projects,
  areas = [],
  onSelectProject,
  onStatusChange,
  onPriorityChange,
  onStartDateChange,
  onDueDateChange,
  onAreaChange,
  onCreateArea,
  onCreatedArea,
  onDeleteArea,
  onReorder,
  initialView = "list",
  view: controlledView,
  onViewChange,
  emptyMessage = "No projects yet.",
  selectedProjectId = null,
  workingProjectIds,
}: AreasOverviewViewProps) {
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
  const [collapsedNested, setCollapsedNested] = useState<Set<string>>(
    () => new Set(),
  );
  const [localProjects, setLocalProjects] = useState(projects);
  const [localAreas, setLocalAreas] = useState(areas);
  const [addingToParent, setAddingToParent] = useState<ProjectArea | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    areaId: string;
    name: string;
    parent: ProjectArea;
    projectCount: number;
  } | null>(null);
  const [deletingArea, setDeletingArea] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorder);

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  useEffect(() => {
    setLocalAreas(areas);
  }, [areas]);

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

  const handleAreaChange = (projectId: string, area: ProjectArea | null) => {
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, area, areaId: area ? project.areaId : null }
          : project,
      ),
    );
    onAreaChange?.(projectId, area);
  };

  const closeDeleteModal = useCallback(() => {
    if (deletingArea) return;
    setPendingDelete(null);
    setDeleteError(null);
  }, [deletingArea]);

  const confirmDeleteArea = useCallback(async () => {
    if (!pendingDelete || !onDeleteArea || deletingArea) return;
    setDeletingArea(true);
    setDeleteError(null);
    try {
      setLocalProjects((current) =>
        current.map((project) =>
          project.areaId === pendingDelete.areaId
            ? {
                ...project,
                area: pendingDelete.parent,
                areaId: null,
              }
            : project,
        ),
      );
      setLocalAreas((current) =>
        current.filter((area) => area.id !== pendingDelete.areaId),
      );
      await onDeleteArea({
        areaId: pendingDelete.areaId,
        parent: pendingDelete.parent,
      });
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete area.",
      );
    } finally {
      setDeletingArea(false);
    }
  }, [deletingArea, onDeleteArea, pendingDelete]);

  useEffect(() => {
    if (!pendingDelete) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteModal();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeDeleteModal, pendingDelete]);

  const handleProjectReorder = useCallback(
    (request: ProjectAreaReorderRequest) => {
      setLocalProjects((current) =>
        applyOptimisticProjectAreaReorder(current, request),
      );
      if (request.fromArea !== request.toArea) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(request.toArea);
          return next;
        });
      }
      onReorder?.(request);
    },
    [onReorder],
  );

  const handlePointerReorder = useCallback(
    (request: GroupedListPointerReorderRequest) => {
      handleProjectReorder({
        projectId: request.itemId,
        fromArea: request.fromGroupKey as ProjectAreaReorderRequest["fromArea"],
        toArea: request.toGroupKey as ProjectAreaReorderRequest["toArea"],
        beforeProjectId: request.beforeItemId,
      });
    },
    [handleProjectReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const project = localProjects.find((entry) => entry.id === itemId);
      return project ? projectAreaGroupKey(project.area) : undefined;
    },
    [localProjects],
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
    itemOrderKey: projectAreaOrderKey,
    groupAppendOrderKey: (groupKey) =>
      projectAreaGroupAppendOrderKey(groupKey as ProjectAreaGroupKey),
    onReorder: handlePointerReorder,
  });

  const selectProject = useCallback(
    (projectKey: string) => {
      if (consumeClickSuppression()) return;
      onSelectProject?.(projectKey);
    },
    [consumeClickSuppression, onSelectProject],
  );

  const groups = useMemo(
    () =>
      groupProjectsByArea(localProjects, localAreas, {
        includeEmpty: Boolean(onCreateArea),
      }),
    [localProjects, localAreas, onCreateArea],
  );

  const boardColumns = useMemo(
    () =>
      groups.map((group) => ({
        key: group.area,
        label: group.label,
        items: [
          ...group.projects,
          ...group.nestedAreas.flatMap((nested) => nested.projects),
        ],
      })),
    [groups],
  );

  const itemIds = useMemo(() => {
    const result: string[] = [];
    for (const group of groups) {
      if (collapsed.has(group.area)) continue;
      for (const project of group.projects) {
        result.push(project.id);
      }
      for (const nested of group.nestedAreas) {
        if (collapsedNested.has(nested.areaId)) continue;
        for (const project of nested.projects) {
          result.push(project.id);
        }
      }
    }
    return result;
  }, [collapsed, collapsedNested, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedProjectId,
    onNavigate: (projectId) => {
      const project = localProjects.find((entry) => entry.id === projectId);
      if (project) selectProject(project.key);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: view === "list" && itemIds.length > 0,
  });

  const showEmpty =
    localProjects.length === 0 &&
    localAreas.length === 0 &&
    !onCreateArea;

  function renderProjectRow(project: ProjectOverviewRowProject) {
    const groupKey = projectAreaGroupKey(project.area);
    return (
      <ProjectOverviewRow
        key={project.id}
        project={project}
        keyboardHighlighted={highlightedId === project.id}
        agentWorking={workingProjectIds?.has(project.id) ?? false}
        onSelect={selectProject}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
        onStartDateChange={handleStartDateChange}
        onDueDateChange={handleDueDateChange}
        pointerReorderBind={
          canReorder ? bindItem(project.id, groupKey) : null
        }
        dragging={draggingItemId === project.id}
        showDragInsertBefore={
          insertBeforeKey === projectAreaOrderKey(project.id)
        }
      />
    );
  }

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
          const isCollapsed = collapsed.has(group.area);
          const canCreateInGroup = group.canCreate && Boolean(onCreateArea);
          const appendKey = projectAreaGroupAppendOrderKey(group.area);

          return (
            <ProjectTypeGroupSection
              key={group.area}
              title={group.label}
              collapsed={isCollapsed}
              addActionLabel="area"
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.area)) next.delete(group.area);
                  else next.add(group.area);
                  return next;
                })
              }
              onAdd={
                canCreateInGroup
                  ? () => {
                      setCollapsed((current) => {
                        const next = new Set(current);
                        next.delete(group.area);
                        return next;
                      });
                      setCreateError(null);
                      setAddingToParent(group.area as ProjectArea);
                    }
                  : undefined
              }
              pointerReorderAppend={
                canReorder ? bindAppendZone(group.area) : null
              }
              showPointerAppendIndicator={insertBeforeKey === appendKey}
            >
              {group.projects.map(renderProjectRow)}
              {addingToParent === group.area &&
              group.canCreate &&
              onCreateArea ? (
                <li className="project-tasks-list__inline-add">
                  <AddProjectInline
                    disabled={creating}
                    error={createError}
                    placeholder="Area name"
                    ariaLabel="Area name"
                    onCancel={() => {
                      setAddingToParent(null);
                      setCreateError(null);
                    }}
                    onSubmit={async (name) => {
                      setCreating(true);
                      setCreateError(null);
                      try {
                        const created = await onCreateArea({
                          parent: group.area as ProjectArea,
                          name,
                        });
                        setAddingToParent(null);
                        if (created?.id) {
                          setLocalAreas((current) => [
                            ...current,
                            {
                              id: created.id,
                              name,
                              parent: group.area as ProjectArea,
                              sortOrder: Date.now(),
                            },
                          ]);
                          onCreatedArea?.(created.id);
                        }
                      } catch (error) {
                        setCreateError(
                          error instanceof Error
                            ? error.message
                            : "Could not create area.",
                        );
                      } finally {
                        setCreating(false);
                      }
                    }}
                  />
                </li>
              ) : null}
              {group.nestedAreas.map((nested) => {
                const nestedCollapsed = collapsedNested.has(nested.areaId);
                const parent = group.area as ProjectArea;
                return (
                  <ProjectTypeGroupSection
                    key={nested.areaId}
                    title={nested.name}
                    collapsed={nestedCollapsed}
                    deleteActionLabel="area"
                    onToggle={() =>
                      setCollapsedNested((current) => {
                        const next = new Set(current);
                        if (next.has(nested.areaId)) next.delete(nested.areaId);
                        else next.add(nested.areaId);
                        return next;
                      })
                    }
                    onDelete={
                      onDeleteArea && group.canCreate
                        ? () => {
                            setDeleteError(null);
                            setPendingDelete({
                              areaId: nested.areaId,
                              name: nested.name,
                              parent,
                              projectCount: nested.projects.length,
                            });
                          }
                        : undefined
                    }
                  >
                    {nested.projects.map(renderProjectRow)}
                  </ProjectTypeGroupSection>
                );
              })}
            </ProjectTypeGroupSection>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="projects-overview">
      <ListBoardViewShell
        view={view}
        onViewChange={setView}
        listContent={listContent}
        boardContent={
          localProjects.length === 0 ? (
            <p className="overview-empty">{emptyMessage}</p>
          ) : (
            <KanbanBoard
              columns={boardColumns}
              getItemId={(project) => project.id}
              getItemColumnKey={(project) =>
                projectAreaGroupKey(project.area)
              }
              compareItems={(left, right) =>
                (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
              }
              findItemById={(itemId) =>
                localProjects.find((project) => project.id === itemId)
              }
              onMoveItem={({ itemId, toColumnKey }) => {
                const area =
                  toColumnKey === "none"
                    ? null
                    : (toColumnKey as ProjectArea);
                handleAreaChange(itemId, area);
              }}
              onOpenItem={(itemId) => {
                const project = localProjects.find(
                  (entry) => entry.id === itemId,
                );
                if (project) selectProject(project.key);
              }}
              selectedItemId={selectedProjectId}
              ariaLabel="Areas board"
              renderCard={(
                project,
                _columnKey,
                { keyboardHighlighted: _highlighted },
              ) => (
                <ProjectBoardCard
                  project={project}
                  agentWorking={workingProjectIds?.has(project.id) ?? false}
                  onOpen={selectProject}
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
      {pendingDelete
        ? createPortal(
            <div
              className="entity-delete-modal-root"
              data-blocking-modal=""
              data-entity-delete-modal=""
            >
              <button
                type="button"
                aria-label="Cancel delete"
                className="entity-delete-modal-backdrop"
                onClick={closeDeleteModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="area-delete-modal-title"
                className="entity-delete-modal"
              >
                <h2
                  id="area-delete-modal-title"
                  className="entity-delete-modal-title"
                >
                  Delete {pendingDelete.name}?
                </h2>
                <p className="entity-delete-modal-body">
                  {pendingDelete.projectCount > 0
                    ? `Are you sure you want to delete this area? ${pendingDelete.projectCount} project${pendingDelete.projectCount === 1 ? "" : "s"} will move to ${PROJECT_AREA_LABELS[pendingDelete.parent]}.`
                    : "Are you sure you want to delete this area? This action cannot be undone."}
                </p>
                {deleteError ? (
                  <p className="entity-delete-modal-error" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="entity-delete-modal-actions">
                  <button
                    type="button"
                    disabled={deletingArea}
                    onClick={closeDeleteModal}
                    className="entity-delete-modal-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletingArea}
                    onClick={() => {
                      void confirmDeleteArea();
                    }}
                    className="entity-delete-modal-confirm"
                  >
                    {deletingArea ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
