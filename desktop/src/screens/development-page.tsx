import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  ProjectsListSkeleton,
  ProjectsOverviewView,
  RegisterPageTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  parseListBoardViewFromLocation,
  persistListBoardView,
  primeTabTitle,
  projectReorderPatches,
  type ListBoardView,
  type OrganizationRef,
  type ProjectOverviewRowProject,
  type ProjectStatus,
} from "@backsteros/ui";

import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useRoutePathActive } from "../lib/shell-route-keep-alive";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { buildWorkingProjectIdSet } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import {
  type ProjectLocationState,
} from "../lib/project-type-cache";
import { navigateToHref } from "../router/navigate-href";

const DEVELOPMENT_LIST_HREF = "/development";

function buildDevelopmentListHref(view: ListBoardView): string {
  if (view === "list") return DEVELOPMENT_LIST_HREF;
  const params = new URLSearchParams({ view });
  return `${DEVELOPMENT_LIST_HREF}?${params.toString()}`;
}

export function DevelopmentPage() {
  const active = useRoutePathActive("/development");
  if (!active) return null;
  return <DevelopmentPageBody />;
}

function DevelopmentPageBody() {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const location = useLocation();
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();

  const listView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.searchStr,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.searchStr],
  );

  const projects = useMemo(
    () =>
      workspace.projects.filter(
        (project) => (project.type ?? "general") === "codebase",
      ),
    [workspace.projects],
  );

  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        workspace.allTasks,
        agentStatus?.workingTaskIds ?? new Set(),
      ),
    [agentStatus?.workingTaskIds, workspace.allTasks],
  );

  useDesktopSectionBreadcrumb([{ label: "Development" }]);

  const organizations = useMemo<OrganizationRef[]>(
    () =>
      workspace.organizations.map((org) => ({
        id: org.id,
        name: org.name,
      })),
    [workspace.organizations],
  );

  if (!workspace.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
        <RegisterPageTitle title="Development" />
        <ProjectsListSkeleton />
      </div>
    );
  }

  return (
    <>
      <RegisterPageTitle title="Development" />
      <ProjectsOverviewView
        projects={projects}
        workingProjectIds={workingProjectIds}
        organizations={organizations}
        secondaryGrouping="organization"
        showAreaFilters={false}
        showTypeGroups={false}
        emptyMessage="No codebase projects yet."
        view={listView}
        onViewChange={(nextView) => {
          persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
          navigate(buildDevelopmentListHref(nextView));
        }}
        onSelectProject={(key) => {
          const match = projects.find(
            (entry) => entry.key.toLowerCase() === key.toLowerCase(),
          );
          const href = `/projects/${key}`;
          if (match?.name) primeTabTitle(href, match.name);
          const state: ProjectLocationState = {
            projectType: "codebase",
            from: "development",
          };
          navigate(href, { state });
        }}
        onStatusChange={(projectId, status: ProjectStatus) => {
          void workspace.patchProject(projectId, { status });
        }}
        onPriorityChange={(projectId, priority) => {
          void workspace.patchProject(projectId, { priority });
        }}
        onStartDateChange={(projectId, startDate) => {
          void workspace.patchProject(projectId, {
            startDate: startDate ? startDate.toISOString() : null,
          });
        }}
        onDueDateChange={(projectId, dueDate) => {
          void workspace.patchProject(projectId, {
            dueDate: dueDate ? dueDate.toISOString() : null,
          });
        }}
        onCreateProject={async ({ status, name }) => {
          return workspace.createProject({
            name,
            status,
            type: "codebase",
          });
        }}
        onCreatedProject={(_id, key) => {
          if (!key) return;
          const href = `/projects/${key}`;
          const match = projects.find(
            (entry) => entry.key.toLowerCase() === key.toLowerCase(),
          );
          if (match?.name) primeTabTitle(href, match.name);
          const state: ProjectLocationState = {
            projectType: "codebase",
            from: "development",
          };
          navigate(href, { state });
        }}
        onReorder={(request) => {
          const patches = projectReorderPatches(
            projects as ProjectOverviewRowProject[],
            request,
          );
          for (const patch of patches) {
            void workspace.patchProject(patch.id, {
              status: patch.status,
              sortOrder: patch.sortOrder,
            });
          }
        }}
      />
    </>
  );
}
