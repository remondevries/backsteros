import { useCallback, useMemo, useRef, type ComponentProps } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ProjectsOverviewView,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  getOrganizationProjectHref,
  getProjectsListAreaHref,
  mapWorkspaceNestedAreas,
  organizationMatchesSlug,
  parseListBoardViewFromLocation,
  parseProjectAreaFilterFromLocation,
  persistListBoardView,
  primeTabTitle,
  projectReorderPatches,
} from "@backsteros/ui";

import { buildWorkingProjectIdSet } from "../../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../../lib/agent/agent-status-context";
import type { ProjectLocationState } from "../../lib/project-type-cache";
import { useKeepAliveActive } from "../../lib/shell-route-keep-alive";
import { useDesktopWorkspaceData } from "../../lib/workspace-data";
import type { DesktopWorkspaceData } from "../../lib/workspace/workspace-data-types";
import { navigateToHref } from "../../router/navigate-href";
import { useProjectsWithOverlay, type ProjectOverlay } from "./project-overlay";
import { useProjectsRouteScope } from "./use-projects-route-scope";

type ProjectsOverviewProps = ComponentProps<typeof ProjectsOverviewView>;

type ProjectsListHandlers = Pick<
  ProjectsOverviewProps,
  | "onAreaChange"
  | "onViewChange"
  | "onSelectProject"
  | "onStatusChange"
  | "onPriorityChange"
  | "onStartDateChange"
  | "onDueDateChange"
  | "onOrganizationChange"
  | "onProjectAreaChange"
  | "onCreateProject"
  | "onCreatedProject"
  | "onCreateArea"
  | "onReorder"
  | "onDeleteProject"
>;

type ProjectsListHandlersContext = {
  workspace: DesktopWorkspaceData;
  projects: ProjectsOverviewProps["projects"];
  organizationRouteParam: string | undefined;
  areaFilter: ProjectsOverviewProps["area"];
  projectsListView: ProjectsOverviewProps["view"];
  /** Current list href, remembered so detail can link back to it. */
  listHref: string;
  navigate: (
    to: string,
    options?: { replace?: boolean; state?: unknown },
  ) => void;
};

/** Stable list callbacks; read the latest context through a ref. */
function useProjectsListHandlers(
  context: ProjectsListHandlersContext,
): ProjectsListHandlers {
  const contextRef = useRef(context);
  contextRef.current = context;
  const pendingCreatedProjectNameRef = useRef<string | null>(null);

  return useMemo<ProjectsListHandlers>(() => {
    const read = () => contextRef.current;
    const patchProject = (projectId: string, patch: Record<string, unknown>) => {
      void read().workspace.patchProject(projectId, patch);
    };
    const openProject = (key: string, projectType?: string) => {
      const { listHref, navigate } = read();
      const state: ProjectLocationState = {
        from: "projects",
        listHref,
        ...(projectType ? { projectType } : {}),
      };
      navigate(`/projects/${key}`, { state });
    };
    return {
      onAreaChange: (area) => {
        const { navigate, projectsListView } = read();
        navigate(getProjectsListAreaHref(area, projectsListView));
      },
      onViewChange: (nextView) => {
        const { navigate, areaFilter } = read();
        persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
        navigate(getProjectsListAreaHref(areaFilter ?? "personal", nextView));
      },
      onSelectProject: (key) => {
        const match = read().projects.find(
          (entry) => entry.key.toLowerCase() === key.toLowerCase(),
        );
        if (match?.name) primeTabTitle(`/projects/${key}`, match.name);
        openProject(key, match?.type ?? undefined);
      },
      onStatusChange: (projectId, status) => {
        patchProject(projectId, { status });
      },
      onPriorityChange: (projectId, priority) => {
        patchProject(projectId, { priority });
      },
      onStartDateChange: (projectId, startDate) => {
        patchProject(projectId, {
          startDate: startDate ? startDate.toISOString() : null,
        });
      },
      onDueDateChange: (projectId, dueDate) => {
        patchProject(projectId, {
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      },
      onOrganizationChange: (projectId, organizationId) => {
        patchProject(projectId, { organizationId });
      },
      onProjectAreaChange: (projectId, area) => {
        patchProject(projectId, { area, areaId: null });
      },
      onCreateProject: async ({ status, name }) => {
        const { workspace, organizationRouteParam } = read();
        const organizationId = organizationRouteParam
          ? (workspace.organizations.find((org) =>
              organizationMatchesSlug(org, organizationRouteParam),
            )?.id ?? null)
          : null;
        pendingCreatedProjectNameRef.current = name;
        return workspace.createProject({ name, status, organizationId });
      },
      onCreatedProject: (id, key) => {
        if (!key) return;
        const { projects, organizationRouteParam, navigate } = read();
        const pendingName = pendingCreatedProjectNameRef.current;
        pendingCreatedProjectNameRef.current = null;
        const createdName =
          pendingName ??
          projects.find((entry) => entry.id === id)?.name ??
          projects.find(
            (entry) => entry.key.toLowerCase() === key.toLowerCase(),
          )?.name;
        if (organizationRouteParam) {
          const href = getOrganizationProjectHref(organizationRouteParam, key);
          if (createdName) primeTabTitle(href, createdName);
          navigate(href);
          return;
        }
        if (createdName) primeTabTitle(`/projects/${key}`, createdName);
        openProject(key);
      },
      onCreateArea: async ({ parent, name }) =>
        read().workspace.createArea({ parent, name }),
      onReorder: (request) => {
        for (const patch of projectReorderPatches(read().projects, request)) {
          patchProject(patch.id, {
            status: patch.status,
            sortOrder: patch.sortOrder,
          });
        }
      },
      onDeleteProject: async (project) => {
        try {
          await read().workspace.softDeleteProject(project.id);
          return { ok: true as const };
        } catch (error) {
          return {
            ok: false as const,
            error:
              error instanceof Error
                ? error.message
                : "Failed to delete project.",
          };
        }
      },
    };
  }, []);
}

/** `/projects` (and org-scoped Projects) list route. */
export function ProjectsListScreen({
  organizationRouteParam,
  projectOverlay,
}: {
  organizationRouteParam?: string;
  projectOverlay: ProjectOverlay;
}) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const keepAliveActive = useKeepAliveActive();
  const { location } = useProjectsRouteScope(organizationRouteParam);
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  const projects = useProjectsWithOverlay(workspace.projects, projectOverlay);
  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        workspace.allTasks,
        agentStatus?.workingTaskIds ?? new Set(),
      ),
    [agentStatus?.workingTaskIds, workspace.allTasks],
  );
  const nestedAreas = useMemo(
    () => mapWorkspaceNestedAreas(workspace.areas),
    [workspace.areas],
  );
  const organizationOptions = useMemo(
    () => workspace.organizations.map((org) => ({ id: org.id, name: org.name })),
    [workspace.organizations],
  );
  const projectsListView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.searchStr,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.searchStr],
  );
  const areaFilter =
    parseProjectAreaFilterFromLocation(location.pathname, location.searchStr) ??
    undefined;

  const handlers = useProjectsListHandlers({
    workspace,
    projects,
    organizationRouteParam,
    areaFilter,
    projectsListView,
    listHref: `${location.pathname}${location.searchStr ?? ""}`,
    navigate,
  });

  return (
    <ProjectsOverviewView
      projects={projects}
      nestedAreas={nestedAreas}
      organizations={organizationOptions}
      workingProjectIds={workingProjectIds}
      typeToFilterEnabled={keepAliveActive}
      area={areaFilter}
      view={projectsListView}
      {...handlers}
    />
  );
}
