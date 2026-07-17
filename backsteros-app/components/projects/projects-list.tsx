"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";

import { reorderProjectAction } from "@/lib/mutations/projects";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { ProjectStatusIcon } from "@/components/project-status";
import { ProjectDueDateDropdown } from "@/components/projects/project-due-date-dropdown";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { ProjectPriorityDropdown } from "@/components/projects/project-priority-dropdown";
import { ProjectProgressRing } from "@/components/projects/project-progress-ring";
import { ProjectStartDateDropdown } from "@/components/projects/project-start-date-dropdown";
import { ProjectStatusDropdown } from "@/components/projects/project-overview/project-status-dropdown";
import { ProjectsListHeader } from "@/components/projects/projects-list-header";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { AddProjectInline } from "@/components/shell/add-project-inline";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import type { Project, TaskPriority } from "@/lib/db/schema";
import {
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "@/lib/project-task-progress";
import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "@/lib/project-status";
import { mapProjectStatusToTaskStatusIcon } from "@/lib/project-status-icon";
import { getProjectHrefFromKey } from "@/lib/project-sections";
import {
  PROJECT_LIST_GRID_CLASS,
  PROJECT_LIST_NUMERIC_CELL_CLASS,
} from "@/lib/projects-list-columns";
import { groupProjectsByStatus } from "@/lib/projects/group-projects-by-status";
import {
  applyOptimisticProjectReorder,
  type ProjectReorderRequest,
} from "@/lib/projects/project-reorder-client";
import { keyboardNavItemProps, keyboardNavListItemClass } from "@/lib/shortcuts/keyboard-nav-item";
import { shouldHandleListKeyboardActivate } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";

import { applyDesktopDragImage } from "@/lib/platform/desktop-drag-image";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import {
  createProjectDragPayload,
  isProjectListDragActive,
  PROJECT_LIST_DRAG_TYPE,
  projectGroupAppendOrderKey,
  projectOrderKey,
  readProjectDragPayload,
  resolveProjectDropBeforeProject,
  resolveProjectDropOnGroupAppend,
} from "./project-list-drag";

type ProjectsListProps = {
  projects: Project[];
  taskProgressByProjectId?: Record<string, ProjectTaskProgress>;
  getProjectHref?: (projectKey: string) => string;
};

const PROJECT_ROW_MOVE_ANIMATION_MS = 220;

function mergeServerProjectsWithOptimistic(
  serverProjects: Project[],
  localProjects: Project[],
): Project[] {
  const localById = new Map(localProjects.map((project) => [project.id, project]));

  return serverProjects.map((serverProject) => {
    const localProject = localById.get(serverProject.id);
    if (!localProject) return serverProject;

    const localStatus = migrateLegacyProjectStatus(localProject.status);
    const serverStatus = migrateLegacyProjectStatus(serverProject.status);

    if (
      localStatus !== serverStatus ||
      localProject.sortOrder !== serverProject.sortOrder
    ) {
      return {
        ...serverProject,
        status: localProject.status,
        sortOrder: localProject.sortOrder,
      };
    }

    return serverProject;
  });
}

function getSelectedProjectIdFromPathname(pathname: string): string | null {
  const orgMatch = pathname.match(/^\/organizations\/[^/]+\/projects\/([^/]+)/);
  if (orgMatch) {
    return orgMatch[1]!;
  }

  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match || match[1] === "new") {
    return null;
  }
  return match[1];
}

function resolveProjectHref(
  project: Project | undefined,
  projectId: string,
  getProjectHref?: (projectKey: string) => string,
): string {
  if (project) {
    const href = getProjectHref
      ? getProjectHref(project.key)
      : getProjectHrefFromKey(project.key);
    return href;
  }

  return `/projects/${projectId}`;
}

const EMPTY_TASK_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

function stopRowNavigation(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function ProjectsList({
  projects,
  taskProgressByProjectId = {},
  getProjectHref,
}: ProjectsListProps) {
  const isMobile = isMobileShellBuildActive();
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const selectedProjectId = getSelectedProjectIdFromPathname(pathname);
  const serverProjectsRef = useLatestRef(projects);
  const moveAnimationTimeoutsRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const [localProjects, setLocalProjects] = useState(projects);
  const [recentlyMovedProjectIds, setRecentlyMovedProjectIds] = useState(
    () => new Set<string>(),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ProjectStatus>>(
    () => new Set(),
  );
  const [addingToStatus, setAddingToStatus] = useState<ProjectStatus | null>(
    null,
  );
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(
    null,
  );
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(
    null,
  );
  const [moveError, setMoveError] = useState<string | null>(null);

  const [prevServerProjects, setPrevServerProjects] = useState(projects);
  if (projects !== prevServerProjects) {
    setPrevServerProjects(projects);
    setLocalProjects((current) =>
      mergeServerProjectsWithOptimistic(projects, current),
    );
  }

  useEffect(() => {
    if (!draggingProjectId) return;

    document.body.classList.add("app-is-dragging");
    return () => document.body.classList.remove("app-is-dragging");
  }, [draggingProjectId]);

  useEffect(() => {
    const timeoutsRef = moveAnimationTimeoutsRef;
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const groups = useMemo(
    () => groupProjectsByStatus(localProjects),
    [localProjects],
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.projects })),
        collapsedGroups,
        (project) => project.id,
      ),
    [collapsedGroups, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedProjectId,
    onNavigate: (projectId) => {
      const project = localProjects.find((entry) => entry.id === projectId);
      router.push(resolveProjectHref(project, projectId, getProjectHref));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  const markProjectMoved = useCallback((projectId: string) => {
    setRecentlyMovedProjectIds((current) => {
      const next = new Set(current);
      next.add(projectId);
      return next;
    });

    const existingTimeout = moveAnimationTimeoutsRef.current.get(projectId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      setRecentlyMovedProjectIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
      moveAnimationTimeoutsRef.current.delete(projectId);
    }, PROJECT_ROW_MOVE_ANIMATION_MS);

    moveAnimationTimeoutsRef.current.set(projectId, timeoutId);
  }, []);

  const handleProjectStatusChange = useCallback(
    (projectId: string, nextStatus: ProjectStatus) => {
      let didMove = false;

      setLocalProjects((current) =>
        current.map((project) => {
          if (project.id !== projectId) return project;
          if (migrateLegacyProjectStatus(project.status) === nextStatus) {
            return project;
          }
          didMove = true;
          return { ...project, status: nextStatus };
        }),
      );

      if (!didMove) return;

      markProjectMoved(projectId);
      setCollapsedGroups((current) => {
        const next = new Set(current);
        next.delete(nextStatus);
        return next;
      });
    },
    [markProjectMoved],
  );

  const handleProjectPriorityChange = useCallback(
    (projectId: string, priority: TaskPriority) => {
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, priority } : project,
        ),
      );
    },
    [],
  );

  const handleProjectStartDateChange = useCallback(
    (projectId: string, startDate: Date | null) => {
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, startDate } : project,
        ),
      );
    },
    [],
  );

  const handleProjectDueDateChange = useCallback(
    (projectId: string, dueDate: Date | null) => {
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, dueDate } : project,
        ),
      );
    },
    [],
  );

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
      setMoveError(null);

      if (request.fromStatus !== request.toStatus) {
        markProjectMoved(request.projectId);
        setCollapsedGroups((current) => {
          const next = new Set(current);
          next.delete(request.toStatus);
          return next;
        });
      }

      void reorderProjectAction({
        projectId: request.projectId,
        toStatus: request.toStatus,
        beforeProjectId: request.beforeProjectId,
      }).then((result) => {
        if (!result.ok) {
          setLocalProjects(serverProjectsRef.current);
          setMoveError(result.error ?? "Failed to move project");
        }
      });
    },
    [handleProjectDragEnd, markProjectMoved, serverProjectsRef],
  );

  function handleProjectDragStart(
    project: Project,
    event: DragEvent<HTMLElement>,
  ) {
    if (isMobile) {
      return;
    }

    event.dataTransfer.setData(
      PROJECT_LIST_DRAG_TYPE,
      createProjectDragPayload(project),
    );
    event.dataTransfer.effectAllowed = "move";
    applyDesktopDragImage(event);
    setDraggingProjectId(project.id);
  }

  function handleProjectDragOver(
    project: Project,
    event: DragEvent<HTMLElement>,
  ) {
    if (isMobile) {
      return;
    }

    if (!isProjectListDragActive(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragInsertBeforeKey(projectOrderKey(project.id));
  }

  function handleProjectDrop(
    project: Project,
    event: DragEvent<HTMLElement>,
  ) {
    if (isMobile) {
      return;
    }

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
  }

  function toggleGroup(status: ProjectStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function startAdding(status: ProjectStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(status);
      return next;
    });
    setAddingToStatus(status);
  }

  return (
    <div
      className={
        isMobile ? "flex flex-col" : "flex min-h-0 flex-1 flex-col"
      }
    >
      <ProjectsListHeader />
      {moveError ? (
        <p className="px-2 pb-2 text-xs text-red-400" role="alert">
          {moveError}
        </p>
      ) : null}
      <ul
        ref={listRef}
        className="flex flex-col gap-1 pt-1"
        role="list"
        {...listContainerProps}
      >
        {groups.map((group) => {
          const collapsed = collapsedGroups.has(group.status);
          const headerStatus = mapProjectStatusToTaskStatusIcon(group.status);
          const isAdding = addingToStatus === group.status;

          return (
            <TaskStatusGroupSection
              key={group.status}
              groupKey={headerStatus}
              title={group.label}
              icon={
                <ProjectStatusIcon
                  status={group.status}
                  size={14}
                  title={group.label}
                />
              }
              collapsed={collapsed}
              onToggle={() => toggleGroup(group.status)}
              onAddTask={() => startAdding(group.status)}
              addActionLabel="project"
              dragInsertBeforeKey={dragInsertBeforeKey}
              onDragInsertBeforeKey={setDragInsertBeforeKey}
              onTaskDragEnd={handleProjectDragEnd}
              listDrag={{
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
              }}
            >
              {group.projects.map((project) => {
                const taskProgress =
                  taskProgressByProjectId[project.id] ?? EMPTY_TASK_PROGRESS;

                return (
                  <li
                    key={project.id}
                    className={`list-none ${
                      dragInsertBeforeKey === projectOrderKey(project.id)
                        ? "border-t border-[#ee7a47]/50"
                        : ""
                    } ${recentlyMovedProjectIds.has(project.id) ? "task-row-enter" : ""}`}
                    {...keyboardNavItemProps(project.id)}
                    onDragOver={
                      isMobile ? undefined : (event) => handleProjectDragOver(project, event)
                    }
                    onDrop={isMobile ? undefined : (event) => handleProjectDrop(project, event)}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      data-tauri-drag-region="false"
                      draggable={!isMobile}
                      onDragStart={(event) =>
                        handleProjectDragStart(project, event)
                      }
                      onDragEnd={isMobile ? undefined : handleProjectDragEnd}
                      onClick={(event) => {
                        if (event.defaultPrevented) return;
                        router.push(
                          resolveProjectHref(project, project.id, getProjectHref),
                        );
                      }}
                      onKeyDown={(event) => {
                        if (shouldHandleListKeyboardActivate(event.nativeEvent)) {
                          event.preventDefault();
                          router.push(
                            resolveProjectHref(project, project.id, getProjectHref),
                          );
                        }
                      }}
                      className={`${
                        isMobile
                          ? `flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm text-foreground hover:bg-white/[0.03] ${keyboardNavListItemClass(highlightedId === project.id)}`
                          : `${PROJECT_LIST_GRID_CLASS} ${
                              draggingProjectId === project.id
                                ? "cursor-grabbing"
                                : "cursor-pointer"
                            } rounded-md py-2.5 text-left text-sm text-foreground hover:bg-white/[0.03] ${keyboardNavListItemClass(highlightedId === project.id)}`
                      }`}
                    >
                      {isMobile ? (
                        <>
                          <span className="project-row__icon inline-flex shrink-0">
                            <ProjectOcticon
                              icon={getDisplayProjectIcon(project.icon)}
                              size={18}
                              className="shrink-0 text-foreground/70"
                            />
                          </span>
                          <span className="project-row__title min-w-0 flex-1 basis-0 truncate text-sm font-medium leading-[18px]">
                            {project.name}
                          </span>
                          <span
                            className="project-row__status relative z-10 inline-flex shrink-0"
                            onMouseDown={stopRowNavigation}
                            onClick={stopRowNavigation}
                          >
                            <ProjectStatusDropdown
                              projectId={project.id}
                              status={project.status}
                              variant="icon"
                              onStatusChange={(status) =>
                                handleProjectStatusChange(project.id, status)
                              }
                            />
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex min-w-0 items-center gap-2">
                            <ProjectOcticon
                              icon={getDisplayProjectIcon(project.icon)}
                              size={14}
                              className="shrink-0 text-foreground/70"
                            />
                            <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/45">
                              {project.key}
                            </span>
                            <span
                              className="relative z-10 inline-flex shrink-0"
                              onMouseDown={stopRowNavigation}
                              onClick={stopRowNavigation}
                            >
                              <ProjectStatusDropdown
                                projectId={project.id}
                                status={project.status}
                                variant="icon"
                                onStatusChange={(status) =>
                                  handleProjectStatusChange(project.id, status)
                                }
                              />
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {project.name}
                            </span>
                          </span>

                          <span aria-hidden="true" />

                          <span
                            className="flex justify-center"
                            onMouseDown={stopRowNavigation}
                            onClick={stopRowNavigation}
                          >
                            <ProjectPriorityDropdown
                              projectId={project.id}
                              priority={project.priority}
                              onPriorityChange={(priority) =>
                                handleProjectPriorityChange(project.id, priority)
                              }
                            />
                          </span>

                          <span
                            className="inline-flex min-w-0 items-center gap-1"
                            onMouseDown={stopRowNavigation}
                            onClick={stopRowNavigation}
                          >
                            <ProjectStartDateDropdown
                              projectId={project.id}
                              startDate={project.startDate}
                              showIcon={false}
                              onStartDateChange={(startDate) =>
                                handleProjectStartDateChange(project.id, startDate)
                              }
                            />
                            <span
                              className="text-sm text-foreground/40"
                              aria-hidden="true"
                            >
                              ›
                            </span>
                            <ProjectDueDateDropdown
                              projectId={project.id}
                              dueDate={project.dueDate}
                              status={project.status}
                              showIcon={false}
                              onDueDateChange={(dueDate) =>
                                handleProjectDueDateChange(project.id, dueDate)
                              }
                            />
                          </span>

                          <span className={PROJECT_LIST_NUMERIC_CELL_CLASS}>
                            {taskProgress.total}
                          </span>

                          <span className="inline-flex items-center justify-end gap-1">
                            <span className="min-w-[2.25rem] text-right font-mono text-xs tabular-nums text-foreground/45">
                              {formatProjectTaskProgressPercent(taskProgress)}
                            </span>
                            <ProjectProgressRing
                              progress={taskProgress}
                              className="shrink-0 text-foreground/25"
                            />
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {isAdding ? (
                <AddProjectInline
                  status={group.status}
                  onCancel={() => setAddingToStatus(null)}
                  onCreated={() => setAddingToStatus(null)}
                />
              ) : null}
            </TaskStatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
