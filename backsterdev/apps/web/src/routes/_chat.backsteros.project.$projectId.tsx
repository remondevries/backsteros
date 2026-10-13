import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";

import {
  parseBacksterosCodebaseListTab,
  type BacksterosCodebaseListTab,
} from "~/backsteros/codebaseListTabs";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { BacksterosProjectOverviewPage } from "../components/sidebar/BacksterosProjectOverviewPage";
import { SidebarInset } from "../components/ui/sidebar";

type BacksterosProjectSearch = {
  readonly title?: string;
  readonly tab?: BacksterosCodebaseListTab;
  /** Logical T3 project-group key for the Settings tab. */
  readonly project?: string;
};

function readTitle(search: { readonly title?: unknown }): string | undefined {
  return typeof search.title === "string" && search.title.trim() ? search.title : undefined;
}

function readProjectKey(search: { readonly project?: unknown }): string | undefined {
  return typeof search.project === "string" && search.project.trim() ? search.project : undefined;
}

function BacksterosProjectOverviewRouteView() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const { state: projectsState } = useBacksterosCodebaseProjects(true);

  const project = useMemo(() => {
    if (projectsState.status !== "ready") return null;
    return projectsState.projects.find((entry) => entry.id === projectId) ?? null;
  }, [projectId, projectsState]);

  const handleTabChange = useCallback(
    (tab: BacksterosCodebaseListTab) => {
      void navigate({
        to: "/backsteros/project/$projectId",
        params: { projectId },
        search: (previous) => {
          const title = readTitle(previous);
          const projectKey = readProjectKey(previous);
          return {
            ...(title ? { title } : {}),
            ...(projectKey ? { project: projectKey } : {}),
            ...(tab === "tasks" ? {} : { tab }),
          };
        },
        replace: true,
      });
    },
    [navigate, projectId],
  );

  useEffect(() => {
    if (!projectId.trim()) {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, projectId]);

  if (!projectId.trim()) return null;

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <BacksterosProjectOverviewPage
        projectId={projectId}
        fallbackTitle={search.title ?? null}
        project={project}
        tab={search.tab ?? "tasks"}
        onTabChange={handleTabChange}
        {...(search.project ? { t3ProjectKey: search.project } : {})}
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/backsteros/project/$projectId")({
  validateSearch: (search: Record<string, unknown>): BacksterosProjectSearch => {
    const tab = parseBacksterosCodebaseListTab(search.tab);
    const title = readTitle(search);
    const project = readProjectKey(search);
    return {
      ...(title ? { title } : {}),
      ...(tab ? { tab } : {}),
      ...(project ? { project } : {}),
    };
  },
  component: BacksterosProjectOverviewRouteView,
});
