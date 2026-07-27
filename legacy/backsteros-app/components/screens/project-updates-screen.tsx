"use client";

import type { Project as ApiProject } from "@backsteros/contracts";
import Link from "next/link";
import { useMemo } from "react";

import { ProjectSectionChrome } from "@/components/projects/project-section-chrome";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { useApiResource } from "@/lib/api-context";
import { normalizeProject } from "@/lib/entity-normalize";
import { encodeProjectSlug } from "@/lib/entity-slugs";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { findLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function ProjectUpdatesScreen({
  projectParam,
  organizationRouteParam,
}: {
  projectParam: string;
  organizationRouteParam?: string;
}) {
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM projects WHERE deleted_at IS NULL",
  );

  const project = useMemo(() => {
    const match = findLocalOrApi(
      localProjects.data?.map((row) => snakeRow(row) as ApiProject),
      projectsResource.data?.projects,
      (entry) => projectMatchesRouteParam(entry, projectParam),
    );
    return match ? normalizeProject(match) : null;
  }, [localProjects.data, projectParam, projectsResource.data]);

  const awaitingProject =
    !project && (projectsResource.loading || localProjects.loading);

  if (!awaitingProject && !project) {
    return (
      <div className="error-state">
        <strong>Project not found</strong>
        <p>No project matches “{projectParam}”.</p>
        <Link
          href={
            organizationContext
              ? `/organizations/${organizationContext.organizationRouteParam}/projects`
              : "/projects"
          }
        >
          Back to projects
        </Link>
      </div>
    );
  }

  const routeParam = project ? encodeProjectSlug(project.key) : projectParam;

  return (
    <ProjectSectionChrome
      projectRouteParam={routeParam}
      projectName={project?.name ?? null}
      organizationRouteParam={organizationRouteParam}
      organizationContext={organizationContext}
      loading={awaitingProject}
      contentClassName="min-h-0 flex-1 overflow-auto p-4"
    >
      <p className="text-sm text-foreground/55">Project updates will live here.</p>
    </ProjectSectionChrome>
  );
}
