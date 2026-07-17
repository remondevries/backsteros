"use client";

import type { Project as ApiProject } from "@backsteros/contracts";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { ProjectLayoutBreadcrumb } from "@/components/projects/project-layout-breadcrumb";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { useApiResource } from "@/lib/api-context";
import { normalizeProject } from "@/lib/entity-normalize";
import { encodeProjectSlug } from "@/lib/entity-slugs";
import { parseOrganizationProjectRoute } from "@/lib/project-route-scope";
import { projectMatchesRouteParam } from "@/lib/project-sections";

/** Resolves a project route param and registers Circle-style project breadcrumbs. */
export function ProjectRouteBreadcrumb({
  projectRouteParam,
  organizationRouteParam: organizationRouteParamProp,
}: {
  projectRouteParam: string;
  organizationRouteParam?: string;
}) {
  const pathname = usePathname();
  const organizationRouteParam =
    organizationRouteParamProp ??
    parseOrganizationProjectRoute(pathname)?.organizationRouteParam;
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);

  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );

  const project = useMemo(() => {
    const match = (projectsResource.data?.projects ?? []).find((entry) =>
      projectMatchesRouteParam(entry, projectRouteParam),
    );
    return match ? normalizeProject(match) : null;
  }, [projectRouteParam, projectsResource.data]);

  if (!project) {
    return null;
  }

  return (
    <ProjectLayoutBreadcrumb
      projectRouteParam={encodeProjectSlug(project.key)}
      projectName={project.name}
      organizationContext={organizationContext}
    />
  );
}
