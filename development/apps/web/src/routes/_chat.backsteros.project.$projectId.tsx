import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { BacksterosProjectOverviewPage } from "../components/sidebar/BacksterosProjectOverviewPage";
import { SidebarInset } from "../components/ui/sidebar";

type BacksterosProjectSearch = {
  readonly title?: string;
};

function BacksterosProjectOverviewRouteView() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const { state: projectsState } = useBacksterosCodebaseProjects(true);

  const project = useMemo(() => {
    if (projectsState.status !== "ready") return null;
    return projectsState.projects.find((entry) => entry.id === projectId) ?? null;
  }, [projectId, projectsState]);

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
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/backsteros/project/$projectId")({
  validateSearch: (search: Record<string, unknown>): BacksterosProjectSearch => ({
    ...(typeof search.title === "string" && search.title.trim()
      ? { title: search.title }
      : {}),
  }),
  component: BacksterosProjectOverviewRouteView,
});
