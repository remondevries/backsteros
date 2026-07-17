"use client";

import type {
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { OrganizationLayoutBreadcrumb } from "@/components/organizations/organization-layout-breadcrumb";
import { OrganizationNav } from "@/components/organizations/organization-nav";
import { ProjectsListContent } from "@/components/projects/projects-list-content";
import { ProjectsListSkeleton } from "@/components/projects/projects-list-skeleton";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import {
  getCanonicalOrganizationRouteParam,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import {
  normalizeOrganization,
  normalizeProject,
} from "@/lib/entity-normalize";
import { getOrganizationProjectHrefFromKey } from "@/lib/project-route-scope";
import {
  buildOrganizationProjectsHref,
  parseProjectsListView,
} from "@/lib/projects-list-view";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import {
  findLocalOrApi,
  preferLocalOrApi,
} from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

function OrganizationProjectsScreenInner({
  organizationParam,
}: {
  organizationParam: string;
}) {
  const searchParams = useSearchParams();
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const localOrgs = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM organizations WHERE deleted_at IS NULL",
  );

  const organization = useMemo(() => {
    const match = findLocalOrApi(
      localOrgs.data?.map((row) => snakeRow(row) as ApiOrganization),
      orgsResource.data?.organizations,
      (entry) => organizationMatchesRouteSlug(entry, organizationParam),
    );
    return match ? normalizeOrganization(match) : null;
  }, [organizationParam, localOrgs.data, orgsResource.data]);

  const projectsResource = useApiResource<{ projects: ApiProject[] }>(
    (client) =>
      organization
        ? client.requestJson(
            `/api/v1/projects?organizationId=${encodeURIComponent(organization.id)}`,
          )
        : Promise.resolve({ projects: [] as ApiProject[] }),
    [organization?.id],
  );

  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    organization
      ? "SELECT * FROM projects WHERE deleted_at IS NULL AND organization_id = ? ORDER BY sort_order, updated_at DESC"
      : null,
    organization ? [organization.id] : [],
  );

  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson("/api/v1/tasks"),
  );

  const projects = useMemo(() => {
    const rows = preferLocalOrApi(
      localProjects.data?.map((row) => snakeRow(row) as ApiProject),
      projectsResource.data?.projects,
    );
    return rows.map(normalizeProject);
  }, [localProjects.data, projectsResource.data]);

  const taskProgressByProjectId = useMemo(() => {
    const progress: Record<string, ProjectTaskProgress> = {};
    const projectIds = new Set(projects.map((project) => project.id));
    for (const task of tasksResource.data?.tasks ?? []) {
      if (!task.projectId || !projectIds.has(task.projectId)) continue;
      const entry = progress[task.projectId] ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (task.status === "completed") entry.completed += 1;
      progress[task.projectId] = entry;
    }
    return progress;
  }, [projects, tasksResource.data]);

  const awaitingOrganization =
    !organization && (orgsResource.loading || localOrgs.loading);

  if (!awaitingOrganization && !organization) {
    return (
      <div className="error-state">
        <strong>Organization not found</strong>
        <p>No organization matches “{organizationParam}”.</p>
        <Link href="/organizations">Back to organizations</Link>
      </div>
    );
  }

  const routeParam = organization
    ? getCanonicalOrganizationRouteParam(organization)
    : organizationParam;
  const loadingProjects =
    Boolean(organization) && projectsResource.loading && !localProjects.data;
  const showContentLoading = awaitingOrganization || loadingProjects;
  const error =
    organization && !localProjects.data ? projectsResource.error : null;
  const initialView = parseProjectsListView(searchParams.get("view"));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <OrganizationLayoutBreadcrumb
        organizationName={organization?.name ?? organizationParam}
      />
      <OrganizationNav
        organizationRouteParam={routeParam}
        organizationId={organization?.id}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        {showContentLoading ? <ProjectsListSkeleton /> : null}
        {error ? (
          <div className="error-state">
            <strong>Could not load projects</strong>
            <p>{apiErrorMessage(error)}</p>
            <button type="button" onClick={projectsResource.reload}>
              Try again
            </button>
          </div>
        ) : null}
        {!showContentLoading && !error && organization ? (
          <ProjectsListContent
            projects={projects}
            taskProgressByProjectId={taskProgressByProjectId}
            initialView={initialView}
            getViewHref={(view) =>
              buildOrganizationProjectsHref(routeParam, { view })
            }
            getProjectHref={(projectKey) =>
              getOrganizationProjectHrefFromKey(routeParam, projectKey)
            }
          />
        ) : null}
      </div>
    </div>
  );
}

export function OrganizationProjectsScreen({
  organizationParam,
}: {
  organizationParam: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OrganizationNav organizationRouteParam={organizationParam} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <ProjectsListSkeleton />
          </div>
        </div>
      }
    >
      <OrganizationProjectsScreenInner organizationParam={organizationParam} />
    </Suspense>
  );
}
