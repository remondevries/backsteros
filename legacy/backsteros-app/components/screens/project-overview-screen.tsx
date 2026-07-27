"use client";

import type {
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { ProjectOverviewPanel } from "@/components/projects/project-overview/project-overview-panel";
import { ProjectOverviewSkeleton } from "@/components/projects/project-overview/project-overview-skeleton";
import { ProjectSectionChrome } from "@/components/projects/project-section-chrome";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { useApiResource } from "@/lib/api-context";
import { normalizeOrganization, normalizeProject } from "@/lib/entity-normalize";
import { encodeProjectSlug } from "@/lib/entity-slugs";
import { deleteProjectAction } from "@/lib/mutations/projects";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import { mapOrganizationToAssignable } from "@/lib/organizations/assignable-organization";
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

export function ProjectOverviewScreen({
  projectParam,
  organizationRouteParam,
}: {
  projectParam: string;
  organizationRouteParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM projects WHERE deleted_at IS NULL",
  );
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );

  const project = useMemo(() => {
    const match = findLocalOrApi(
      localProjects.data?.map((row) => snakeRow(row) as ApiProject),
      projectsResource.data?.projects,
      (entry) => projectMatchesRouteParam(entry, projectParam),
    );
    return match ? normalizeProject(match) : null;
  }, [localProjects.data, projectParam, projectsResource.data]);

  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    project
      ? "SELECT status FROM tasks WHERE deleted_at IS NULL AND project_id = ?"
      : null,
    project ? [project.id] : [],
  );
  const tasksResource = useApiResource<{ tasks: ApiTask[] }>(
    (client) =>
      project
        ? client.requestJson(
            `/api/v1/tasks?projectId=${encodeURIComponent(project.id)}`,
          )
        : Promise.resolve({ tasks: [] as ApiTask[] }),
    [project?.id],
  );

  const taskProgress = useMemo(() => {
    const rows =
      localTasks.data?.map((row) => snakeRow(row) as { status: string }) ??
      tasksResource.data?.tasks ??
      [];
    const total = rows.length;
    const completed = rows.filter((task) => task.status === "completed").length;
    return { total, completed };
  }, [localTasks.data, tasksResource.data]);

  const organizations = useMemo(
    () =>
      (orgsResource.data?.organizations ?? []).map((org) =>
        mapOrganizationToAssignable(normalizeOrganization(org)),
      ),
    [orgsResource.data],
  );

  const handleDeleteProject = useCallback(async () => {
    if (!project) {
      return { ok: false as const, error: "Project is required." };
    }
    const result = await deleteProjectAction({
      projectId: project.id,
      pathname,
    });
    if (!result.ok) {
      return result;
    }
    router.replace(result.redirectHref);
    return result;
  }, [pathname, project, router]);

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
      loadingFallback={<ProjectOverviewSkeleton />}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {project ? (
        <>
          <RegisterEntityDeleteAction
            entityLabel={`project "${project.name}"`}
            onDelete={handleDeleteProject}
          />
          <ProjectOverviewPanel
            project={project}
            taskProgress={taskProgress}
            organizations={organizations}
          />
        </>
      ) : null}
    </ProjectSectionChrome>
  );
}
