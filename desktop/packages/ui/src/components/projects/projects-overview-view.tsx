"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";

import { groupProjectsByStatus } from "../../projects/group-projects-by-status.js";
import {
  groupProjectsByNestedArea,
  projectNestedAreaCollapseKey,
  type NestedAreaRef,
} from "../../projects/group-projects-by-area.js";
import {
  groupProjectsByOrganization,
  projectOrganizationCollapseKey,
  type OrganizationRef,
} from "../../projects/group-projects-by-organization.js";
import {
  groupProjectsByType,
  projectTypeCollapseKey,
} from "../../projects/group-projects-by-type.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  filterProjectsByArea,
  getProjectAreaFilterLabel,
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_FILTERS,
  type ProjectAreaFilter,
} from "../../projects/project-areas.js";
import type { ProjectStatus } from "../../projects/project-status.js";
import {
  projectGroupAppendOrderKey,
  projectOrderKey,
  type ProjectReorderRequest,
} from "../../projects/project-list-drag.js";
import { applyOptimisticProjectReorder } from "../../projects/project-reorder.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerReorderRequest,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import {
  ListBoardViewShell,
  type ListBoardView,
} from "../list-nav/list-board-view-shell.js";
import { KanbanBoard } from "../list-nav/kanban-board.js";
import { PillNav } from "../shared/pill-nav.js";
import { ProjectBoardCard } from "./project-board-card.js";
import {
  ProjectOverviewRow,
  ProjectsListHeader,
  type ProjectOverviewRowProject,
} from "./project-overview-row.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { AddProjectInline } from "./add-project-inline.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { mapProjectStatusToTaskStatusIcon } from "../../projects/project-status-icon-model.js";
import { migrateLegacyProjectStatus } from "../../projects/project-status.js";
import {
  computeProjectKeyColumnCh,
  projectKeyColumnCssVars,
} from "../../projects/project-key-column-width.js";

type SecondaryBucket = {
  id: string | null;
  name: string | null;
  showHeader: boolean;
  projects: ProjectOverviewRowProject[];
};

function getSecondaryBuckets(
  projects: ProjectOverviewRowProject[],
  mode: "nestedArea" | "organization",
  nestedAreas: NestedAreaRef[],
  organizations: OrganizationRef[],
): SecondaryBucket[] {
  if (mode === "organization") {
    return groupProjectsByOrganization(projects, organizations).map(
      (bucket) => ({
        id: bucket.organizationId,
        name: bucket.name,
        showHeader: bucket.showHeader,
        projects: bucket.projects,
      }),
    );
  }
  return groupProjectsByNestedArea(projects, nestedAreas).map((bucket) => ({
    id: bucket.areaId,
    name: bucket.name,
    showHeader: bucket.showHeader,
    projects: bucket.projects,
  }));
}

function secondaryCollapseKey(
  mode: "nestedArea" | "organization",
  status: string,
  type: string,
  id: string,
): string {
  return mode === "organization"
    ? projectOrganizationCollapseKey(status, type, id)
    : projectNestedAreaCollapseKey(status, type, id);
}

export type ProjectsOverviewViewProps = {
  projects: ProjectOverviewRowProject[];
  /** Nested custom areas — used to subgroup list rows (read-only). */
  nestedAreas?: NestedAreaRef[];
  /** Organizations — used when `secondaryGrouping` is `"organization"`. */
  organizations?: OrganizationRef[];
  /**
   * Secondary headers inside status/type groups.
   * Default `"nestedArea"` (Projects / Areas). Use `"organization"` on Development.
   */
  secondaryGrouping?: "nestedArea" | "organization";
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
  /**
   * When false, skip type subgroups (e.g. Development console — all codebase).
   * Default true.
   */
  showTypeGroups?: boolean;
  emptyMessage?: string;
  /** Route-selected project id, used as a j/k anchor (main-list keyboard nav). */
  selectedProjectId?: string | null;
  /** Project ids with an active working agent (swap row/card icon for loader). */
  workingProjectIds?: ReadonlySet<string>;
  /**
   * Fixed monospace width (in `ch`) for the project-key column.
   * Prefer the global max across all workspace projects so area filters do not
   * resize the column.
   */
  projectKeyColumnCh?: number;
};

export function ProjectsOverviewView({
  projects,
  nestedAreas = [],
  organizations = [],
  secondaryGrouping = "nestedArea",
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
  showTypeGroups = true,
  emptyMessage = "No projects in this area.",
  selectedProjectId = null,
  workingProjectIds,
  projectKeyColumnCh: projectKeyColumnChProp,
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
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedNestedAreas, setCollapsedNestedAreas] = useState<Set<string>>(
    () => new Set(),
  );
  const [localProjects, setLocalProjects] = useState(projects);
  const [addingToStatus, setAddingToStatus] = useState<ProjectStatus | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const canReorder = Boolean(onReorder);
  const projectKeyColumnCh = useMemo(
    () => projectKeyColumnChProp ?? computeProjectKeyColumnCh(projects),
    [projectKeyColumnChProp, projects],
  );
  const projectKeyColumnStyle = useMemo(
    () => projectKeyColumnCssVars(projectKeyColumnCh),
    [projectKeyColumnCh],
  );

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

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

  const handleProjectReorder = useCallback(
    (request: ProjectReorderRequest) => {
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
    [onReorder],
  );

  const handlePointerReorder = useCallback(
    (request: GroupedListPointerReorderRequest) => {
      handleProjectReorder({
        projectId: request.itemId,
        fromStatus: migrateLegacyProjectStatus(request.fromGroupKey),
        toStatus: migrateLegacyProjectStatus(request.toGroupKey),
        beforeProjectId: request.beforeItemId,
      });
    },
    [handleProjectReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const project = localProjects.find((entry) => entry.id === itemId);
      return project
        ? migrateLegacyProjectStatus(project.status)
        : undefined;
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
    itemOrderKey: projectOrderKey,
    groupAppendOrderKey: (groupKey) =>
      projectGroupAppendOrderKey(migrateLegacyProjectStatus(groupKey)),
    onReorder: handlePointerReorder,
  });

  const selectProject = useCallback(
    (projectKey: string) => {
      if (consumeClickSuppression()) return;
      onSelectProject?.(projectKey);
    },
    [consumeClickSuppression, onSelectProject],
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

  const itemIds = useMemo(() => {
    const result: string[] = [];
    for (const group of groups) {
      if (collapsed.has(group.status)) continue;
      const typeGroups = showTypeGroups
        ? groupProjectsByType(group.projects)
        : [
            {
              type: "general" as const,
              label: "",
              showHeader: false,
              projects: group.projects,
            },
          ];
      for (const typeGroup of typeGroups) {
        if (
          typeGroup.showHeader &&
          collapsedTypes.has(
            projectTypeCollapseKey(group.status, typeGroup.type),
          )
        ) {
          continue;
        }
        for (const secondary of getSecondaryBuckets(
          typeGroup.projects,
          secondaryGrouping,
          nestedAreas,
          organizations,
        )) {
          if (
            secondary.showHeader &&
            secondary.id &&
            collapsedNestedAreas.has(
              secondaryCollapseKey(
                secondaryGrouping,
                group.status,
                typeGroup.type,
                secondary.id,
              ),
            )
          ) {
            continue;
          }
          for (const project of secondary.projects) {
            result.push(project.id);
          }
        }
      }
    }
    return result;
  }, [
    collapsed,
    collapsedNestedAreas,
    collapsedTypes,
    groups,
    nestedAreas,
    organizations,
    secondaryGrouping,
    showTypeGroups,
  ]);

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

  const pillItems = PROJECT_AREA_FILTERS.map((value) => ({
    value,
    label: getProjectAreaFilterLabel(value),
  }));

  const showEmpty =
    filtered.length === 0 && !onCreateProject;

  const listContent = showEmpty ? (
    <p className="overview-empty">{emptyMessage}</p>
  ) : (
    <div className="projects-overview-list" style={projectKeyColumnStyle}>
      <ProjectsListHeader />
      <ul
        className="overview-grouped-list"
        role="list"
        ref={listRef}
        {...listContainerProps}
      >
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.status);
          const appendKey = projectGroupAppendOrderKey(group.status);
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
              pointerReorderAppend={
                canReorder ? bindAppendZone(group.status) : null
              }
              showPointerAppendIndicator={insertBeforeKey === appendKey}
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
              {(showTypeGroups
                ? groupProjectsByType(group.projects)
                : [
                    {
                      type: "general" as const,
                      label: "",
                      showHeader: false,
                      projects: group.projects,
                    },
                  ]
              ).map((typeGroup) => {
                const renderRows = (
                  areaProjects: ProjectOverviewRowProject[],
                ) =>
                  areaProjects.map((project) => (
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
                        canReorder
                          ? bindItem(project.id, group.status)
                          : null
                      }
                      dragging={draggingItemId === project.id}
                      showDragInsertBefore={
                        insertBeforeKey === projectOrderKey(project.id)
                      }
                    />
                  ));

                const renderSecondaryGroups = () =>
                  getSecondaryBuckets(
                    typeGroup.projects,
                    secondaryGrouping,
                    nestedAreas,
                    organizations,
                  ).map((secondary) => {
                    if (!secondary.showHeader || !secondary.id) {
                      return (
                        <Fragment
                          key={`${typeGroup.type}:ungrouped`}
                        >
                          {renderRows(secondary.projects)}
                        </Fragment>
                      );
                    }

                    const secondaryKey = secondaryCollapseKey(
                      secondaryGrouping,
                      group.status,
                      typeGroup.type,
                      secondary.id,
                    );
                    const secondaryCollapsed =
                      collapsedNestedAreas.has(secondaryKey);

                    return (
                      <ProjectTypeGroupSection
                        key={secondary.id}
                        title={
                          secondary.name ??
                          (secondaryGrouping === "organization"
                            ? "Organization"
                            : "Sub-area")
                        }
                        collapsed={secondaryCollapsed}
                        onToggle={() =>
                          setCollapsedNestedAreas((current) => {
                            const next = new Set(current);
                            if (next.has(secondaryKey)) next.delete(secondaryKey);
                            else next.add(secondaryKey);
                            return next;
                          })
                        }
                      >
                        {renderRows(secondary.projects)}
                      </ProjectTypeGroupSection>
                    );
                  });

                if (!typeGroup.showHeader) {
                  return (
                    <Fragment key={typeGroup.type}>
                      {renderSecondaryGroups()}
                    </Fragment>
                  );
                }

                const typeKey = projectTypeCollapseKey(
                  group.status,
                  typeGroup.type,
                );
                const typeCollapsed = collapsedTypes.has(typeKey);

                return (
                  <ProjectTypeGroupSection
                    key={typeGroup.type}
                    title={typeGroup.label}
                    collapsed={typeCollapsed}
                    onToggle={() =>
                      setCollapsedTypes((current) => {
                        const next = new Set(current);
                        if (next.has(typeKey)) next.delete(typeKey);
                        else next.add(typeKey);
                        return next;
                      })
                    }
                  >
                    {renderSecondaryGroups()}
                  </ProjectTypeGroupSection>
                );
              })}
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
              onOpenItem={selectProject}
              selectedItemId={selectedProjectId}
              ariaLabel="Projects board"
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
    </div>
  );
}
