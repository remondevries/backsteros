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
import { useListMultiSelect } from "../../list-nav/use-list-multi-select.js";
import {
  filterProjectsByArea,
  getProjectAreaFilterLabel,
  PROJECT_AREA_FILTER_DEFAULT,
  PROJECT_AREA_FILTER_OTHER,
  PROJECT_AREA_FILTERS,
  PROJECT_AREAS,
  isDefinedProjectArea,
  type ProjectArea,
  type ProjectAreaFilter,
} from "../../projects/project-areas.js";
import {
  filterProjectsByType,
  getProjectTypeFilterLabel,
  PROJECT_TYPE_FILTER_ALL,
  PROJECT_TYPE_FILTERS,
  type ProjectTypeFilter,
} from "../../projects/project-type-filters.js";
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
import {
  ProjectBulkEditBar,
  type ProjectBulkPatch,
} from "./project-bulk-edit-bar.js";
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
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

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
    return groupProjectsByOrganization(projects, organizations, {
      ungroupedLabel: "No organization",
    }).map((bucket) => ({
      id: bucket.organizationId ?? "__none__",
      name: bucket.name,
      showHeader: bucket.showHeader,
      projects: bucket.projects,
    }));
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
   * Default `"nestedArea"` (Projects / Areas). Use `"organization"` on Catalog.
   */
  secondaryGrouping?: "nestedArea" | "organization";
  onSelectProject?: (projectKey: string) => void;
  onStatusChange?: (projectId: string, status: ProjectStatus) => void;
  onPriorityChange?: (projectId: string, priority: number) => void;
  onStartDateChange?: (projectId: string, startDate: Date | null) => void;
  onDueDateChange?: (projectId: string, dueDate: Date | null) => void;
  onOrganizationChange?: (
    projectId: string,
    organizationId: string | null,
  ) => void;
  /** Create a project in a status group (Next AddProjectInline). */
  onCreateProject?: (input: {
    status: ProjectStatus;
    name: string;
  }) => Promise<{ id: string; key?: string } | void> | { id: string; key?: string } | void;
  onCreatedProject?: (projectId: string, projectKey?: string) => void;
  /** Create a nested custom area under Personal / Business / Clients. */
  onCreateArea?: (input: {
    parent: ProjectArea;
    name: string;
  }) => Promise<{ id: string } | void> | { id: string } | void;
  onCreatedArea?: (areaId: string) => void;
  /** Persist list drag-reorder (status + sortOrder cascade on host). */
  onReorder?: (request: ProjectReorderRequest) => void;
  initialArea?: ProjectAreaFilter;
  /** Controlled area filter (URL sync). */
  area?: ProjectAreaFilter;
  onAreaChange?: (area: ProjectAreaFilter) => void;
  initialType?: ProjectTypeFilter;
  /** Controlled type filter (URL sync) — Catalog pills. */
  typeFilter?: ProjectTypeFilter;
  onTypeFilterChange?: (type: ProjectTypeFilter) => void;
  initialView?: ListBoardView;
  /** Controlled list/board view (URL sync). */
  view?: ListBoardView;
  onViewChange?: (view: ListBoardView) => void;
  /** When false, hide area pills (organization projects screen). Default true. */
  showAreaFilters?: boolean;
  /** When true, show type pills (Catalog). Default false. */
  showTypeFilters?: boolean;
  /**
   * When false, skip type subgroups (e.g. single-type Catalog filter).
   * Default true. Auto-disabled while a specific type filter is active.
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
  /**
   * Column set for the list header + rows.
   * `"domains"` keeps Name + Dates only (Catalog Domains).
   */
  listColumns?: "default" | "domains";
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
  onOrganizationChange,
  onCreateProject,
  onCreatedProject,
  onCreateArea,
  onCreatedArea,
  onReorder,
  initialArea = PROJECT_AREA_FILTER_DEFAULT,
  area: controlledArea,
  onAreaChange,
  initialType = PROJECT_TYPE_FILTER_ALL,
  typeFilter: controlledTypeFilter,
  onTypeFilterChange,
  initialView = "list",
  view: controlledView,
  onViewChange,
  showAreaFilters = true,
  showTypeFilters = false,
  showTypeGroups = true,
  emptyMessage = "No projects in this area.",
  selectedProjectId = null,
  workingProjectIds,
  projectKeyColumnCh: projectKeyColumnChProp,
  listColumns = "default",
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
  const [uncontrolledTypeFilter, setUncontrolledTypeFilter] =
    useState<ProjectTypeFilter>(initialType);
  const typeFilter = controlledTypeFilter ?? uncontrolledTypeFilter;
  const setTypeFilter = (next: ProjectTypeFilter) => {
    onTypeFilterChange?.(next);
    if (controlledTypeFilter === undefined) {
      setUncontrolledTypeFilter(next);
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
  const effectiveShowTypeGroups =
    showTypeGroups && typeFilter === PROJECT_TYPE_FILTER_ALL;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedNestedAreas, setCollapsedNestedAreas] = useState<Set<string>>(
    () => new Set(),
  );
  const [localProjects, setLocalProjects] = useState(projects);
  const pendingStatusByIdRef = useRef(new Map<string, ProjectStatus>());
  const pendingPriorityByIdRef = useRef(new Map<string, number>());
  const [addingToStatus, setAddingToStatus] = useState<ProjectStatus | null>(
    null,
  );
  const [addingArea, setAddingArea] = useState(false);
  const [createAreaParent, setCreateAreaParent] = useState<ProjectArea>("personal");
  const [createAreaError, setCreateAreaError] = useState<string | null>(null);
  const [creatingArea, setCreatingArea] = useState(false);
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
    setLocalProjects(
      projects.map((project) => {
        let next = project;
        const pendingStatus = pendingStatusByIdRef.current.get(project.id);
        if (pendingStatus !== undefined) {
          if (migrateLegacyProjectStatus(project.status) === pendingStatus) {
            pendingStatusByIdRef.current.delete(project.id);
          } else {
            next = { ...next, status: pendingStatus };
          }
        }
        const pendingPriority = pendingPriorityByIdRef.current.get(project.id);
        if (pendingPriority !== undefined) {
          if (project.priority === pendingPriority) {
            pendingPriorityByIdRef.current.delete(project.id);
          } else {
            next = { ...next, priority: pendingPriority };
          }
        }
        return next;
      }),
    );
  }, [projects]);

  const handleStatusChange = (projectId: string, status: ProjectStatus) => {
    pendingStatusByIdRef.current.set(projectId, status);
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, status } : project,
      ),
    );
    onStatusChange?.(projectId, status);
  };

  const handlePriorityChange = (projectId: string, priority: number) => {
    pendingPriorityByIdRef.current.set(projectId, priority);
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
    const target = localProjects.find((project) => project.id === projectId);
    if (target?.type === "domeinname") return;
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
    const target = localProjects.find((project) => project.id === projectId);
    if (target?.type === "domeinname") return;
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, dueDate: dueDate ? dueDate.getTime() : null }
          : project,
      ),
    );
    onDueDateChange?.(projectId, dueDate);
  };

  const handleOrganizationChange = (
    projectId: string,
    organizationId: string | null,
  ) => {
    setLocalProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, organizationId } : project,
      ),
    );
    onOrganizationChange?.(projectId, organizationId);
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

  const filtered = useMemo(() => {
    // Catalog (and other type-only lists) hide area pills — do not apply the
    // Projects-page area default (Personal), or unassigned projects vanish.
    const byArea = showAreaFilters
      ? filterProjectsByArea(localProjects, area)
      : localProjects;
    return showTypeFilters
      ? filterProjectsByType(byArea, typeFilter)
      : byArea;
  }, [localProjects, area, showAreaFilters, showTypeFilters, typeFilter]);
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
      const typeGroups = effectiveShowTypeGroups
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
    effectiveShowTypeGroups,
    groups,
    nestedAreas,
    organizations,
    secondaryGrouping,
  ]);

  const extendSelectionAlongStepRef = useRef<
    (fromId: string | null, toId: string) => void
  >(() => {});

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
    onShiftStep: ({ fromId, toId }) => {
      if (view !== "list") return;
      extendSelectionAlongStepRef.current(fromId, toId);
    },
  });

  const {
    selectedIds,
    hasBulkSelection,
    isSelected,
    toggleSelected,
    extendSelectionAlongStep,
    selectAll,
    clearSelection,
  } = useListMultiSelect(itemIds, {
    selectAllShortcutEnabled: view === "list",
    highlightedId,
    toggleHighlightedShortcutEnabled: view === "list",
  });
  extendSelectionAlongStepRef.current = extendSelectionAlongStep;

  const selectedProjects = useMemo(
    () => filtered.filter((project) => selectedIds.has(project.id)),
    [filtered, selectedIds],
  );

  const organizationOptions = useMemo<SearchableDropdownOption<string>[]>(
    () =>
      organizations.map((org) => ({
        value: org.id,
        label: org.name,
      })),
    [organizations],
  );

  const applyBulkPatch = async (patch: ProjectBulkPatch) => {
    const ids = [...selectedIds];
    for (const projectId of ids) {
      if (patch.status !== undefined) {
        handleStatusChange(projectId, patch.status);
      }
      if (patch.priority !== undefined) {
        handlePriorityChange(projectId, patch.priority);
      }
      if ("startDate" in patch) {
        handleStartDateChange(projectId, patch.startDate ?? null);
      }
      if ("dueDate" in patch) {
        handleDueDateChange(projectId, patch.dueDate ?? null);
      }
      if ("organizationId" in patch) {
        handleOrganizationChange(projectId, patch.organizationId ?? null);
      }
    }
  };

  const areaPillItems = PROJECT_AREA_FILTERS.map((value) => ({
    value,
    label: getProjectAreaFilterLabel(value),
  }));
  const typePillItems = PROJECT_TYPE_FILTERS.map((value) => ({
    value,
    label: getProjectTypeFilterLabel(value),
  }));

  const showEmpty =
    filtered.length === 0 && !onCreateProject;

  const listContent = showEmpty ? (
    <p className="overview-empty">{emptyMessage}</p>
  ) : (
    <div
      className={[
        "projects-overview-list",
        listColumns === "domains" ? "projects-overview-list--domains" : null,
        hasBulkSelection ? "has-bulk-selection" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={projectKeyColumnStyle}
    >
      <ProjectsListHeader columns={listColumns} />
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
              {(effectiveShowTypeGroups
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
                      columns={listColumns}
                      selected={isSelected(project.id)}
                      forceShowCheckbox={hasBulkSelection}
                      keyboardHighlighted={highlightedId === project.id}
                      agentWorking={workingProjectIds?.has(project.id) ?? false}
                      onSelect={selectProject}
                      onToggleSelected={(projectId, _checked, event) =>
                        toggleSelected(projectId, Boolean(event?.shiftKey))
                      }
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
                    if (!secondary.showHeader) {
                      return (
                        <Fragment
                          key={`${typeGroup.type}:ungrouped`}
                        >
                          {renderRows(secondary.projects)}
                        </Fragment>
                      );
                    }

                    const secondaryId = secondary.id ?? "__none__";
                    const secondaryKey = secondaryCollapseKey(
                      secondaryGrouping,
                      group.status,
                      typeGroup.type,
                      secondaryId,
                    );
                    const secondaryCollapsed =
                      collapsedNestedAreas.has(secondaryKey);

                    return (
                      <ProjectTypeGroupSection
                        key={secondaryId}
                        title={
                          secondary.name ??
                          (secondaryGrouping === "organization"
                            ? "No organization"
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
      {showTypeFilters ? (
        <div className="projects-overview__area-nav">
          <PillNav
            ariaLabel="Project type"
            items={typePillItems}
            value={typeFilter}
            onChange={setTypeFilter}
            className="projects-overview__area-pills"
          />
        </div>
      ) : null}
      {showAreaFilters ? (
        <div className="projects-overview__area-nav">
          <PillNav
            ariaLabel="Project area"
            items={areaPillItems}
            value={area}
            onChange={setArea}
            className="projects-overview__area-pills"
          />
          {onCreateArea ? (
            <button
              type="button"
              className="projects-overview__add-area"
              aria-label="Add area"
              aria-expanded={addingArea}
              onClick={() => {
                const parent = isDefinedProjectArea(area)
                  ? area
                  : createAreaParent;
                setCreateAreaParent(parent);
                setCreateAreaError(null);
                setAddingArea(true);
              }}
            >
              <ProjectsAreaPlusIcon />
            </button>
          ) : null}
        </div>
      ) : null}
      {showAreaFilters && addingArea && onCreateArea ? (
        <div className="projects-overview__add-area-form">
          {area === PROJECT_AREA_FILTER_OTHER ? (
            <div
              className="projects-overview__add-area-parents"
              role="group"
              aria-label="Area parent"
            >
              {PROJECT_AREAS.map((parent) => (
                <button
                  key={parent}
                  type="button"
                  className={`projects-overview__add-area-parent${
                    createAreaParent === parent ? " is-active" : ""
                  }`}
                  aria-pressed={createAreaParent === parent}
                  onClick={() => setCreateAreaParent(parent)}
                >
                  {getProjectAreaFilterLabel(parent)}
                </button>
              ))}
            </div>
          ) : null}
          <AddProjectInline
            disabled={creatingArea}
            error={createAreaError}
            placeholder="Area name"
            ariaLabel="Area name"
            onCancel={() => {
              setAddingArea(false);
              setCreateAreaError(null);
            }}
            onSubmit={async (name) => {
              const parent = isDefinedProjectArea(area)
                ? area
                : createAreaParent;
              setCreatingArea(true);
              setCreateAreaError(null);
              try {
                const created = await onCreateArea({ parent, name });
                setAddingArea(false);
                if (created?.id) onCreatedArea?.(created.id);
                if (area === PROJECT_AREA_FILTER_OTHER) {
                  setArea(parent);
                }
              } catch (error) {
                setCreateAreaError(
                  error instanceof Error
                    ? error.message
                    : "Could not create area.",
                );
              } finally {
                setCreatingArea(false);
              }
            }}
          />
        </div>
      ) : null}
      <ListBoardViewShell
        view={view}
        onViewChange={setView}
        listContent={listContent}
        listOverlay={
          hasBulkSelection ? (
            <ProjectBulkEditBar
              selectedProjects={selectedProjects}
              showPriority
              showOrganization={
                secondaryGrouping === "organization" &&
                organizationOptions.length > 0
              }
              organizationOptions={organizationOptions}
              onClear={clearSelection}
              onSelectAll={
                selectedIds.size < itemIds.length ? selectAll : undefined
              }
              onApply={applyBulkPatch}
            />
          ) : null
        }
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

function ProjectsAreaPlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
