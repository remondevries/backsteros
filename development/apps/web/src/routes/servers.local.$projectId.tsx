import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  isLocalProjectSectionId,
  LocalProjectPage,
  type LocalProjectSectionId,
} from "../components/servers/LocalProjectPage";
import { useLocalProjects } from "../components/servers/useLocalProjects";

export type LocalProjectSearch = {
  readonly section?: LocalProjectSectionId;
};

export const Route = createFileRoute("/servers/local/$projectId")({
  validateSearch: (raw: Record<string, unknown>): LocalProjectSearch => ({
    ...(isLocalProjectSectionId(raw.section) ? { section: raw.section } : {}),
  }),
  component: LocalProjectRoute,
});

function LocalProjectRoute() {
  const { projectId } = Route.useParams();
  const { section } = Route.useSearch();
  const { projects, loading } = useLocalProjects(true);
  const project = useMemo(
    () => projects.find((entry) => entry.projectId === projectId) ?? null,
    [projectId, projects],
  );

  return (
    <LocalProjectPage
      projectId={projectId}
      project={project}
      loading={loading}
      section={section ?? "overview"}
    />
  );
}
