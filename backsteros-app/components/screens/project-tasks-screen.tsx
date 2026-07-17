"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ProjectSectionChrome } from "@/components/projects/project-section-chrome";
import { ProjectTasksContent } from "@/components/projects/project-tasks-content";
import { TasksListSkeleton } from "@/components/tasks/tasks-list-skeleton";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import { encodeProjectSlug } from "@/lib/entity-slugs";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import {
  normalizeContact,
  normalizeProject,
  normalizeTask,
} from "@/lib/entity-normalize";
import { parseProjectTaskView } from "@/lib/project-task-view";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { findLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

function ProjectTasksScreenInner({
  projectParam,
  organizationRouteParam,
}: {
  projectParam: string;
  organizationRouteParam?: string;
}) {
  const searchParams = useSearchParams();
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);
  const initialView = parseProjectTaskView(searchParams.get("view"));

  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM projects WHERE deleted_at IS NULL",
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );

  const project = useMemo(() => {
    const match = findLocalOrApi(
      localProjects.data?.map((row) => snakeRow(row) as ApiProject),
      projectsResource.data?.projects,
      (entry) => projectMatchesRouteParam(entry, projectParam),
    );
    return match ? normalizeProject(match) : null;
  }, [localProjects.data, projectParam, projectsResource.data]);

  const tasksResource = useApiResource<{ tasks: ApiTask[] }>(
    (client) =>
      project
        ? client.requestJson(
            `/api/v1/tasks?projectId=${encodeURIComponent(project.id)}`,
          )
        : Promise.resolve({ tasks: [] as ApiTask[] }),
    [project?.id],
  );

  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    project
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL AND project_id = ? ORDER BY sort_order, updated_at DESC"
      : null,
    project ? [project.id] : [],
  );

  const tasks = useMemo(() => {
    const rows =
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
      tasksResource.data?.tasks ??
      [];
    return rows.map(normalizeTask);
  }, [localTasks.data, tasksResource.data]);

  const contacts = useMemo(
    () =>
      (contactsResource.data?.contacts ?? []).map((contact) =>
        mapContactToAssignable({
          ...normalizeContact(contact),
          organization: null,
        }),
      ),
    [contactsResource.data],
  );

  const awaitingProject =
    !project && (projectsResource.loading || localProjects.loading);
  const awaitingTasks =
    Boolean(project) && tasksResource.loading && !localTasks.data;
  const showContentLoading = awaitingProject || awaitingTasks;

  if (!awaitingProject && !project) {
    return (
      <div className="error-state">
        <strong>Project not found</strong>
        <p>No project matches “{projectParam}”.</p>
      </div>
    );
  }

  const routeParam = project ? encodeProjectSlug(project.key) : projectParam;

  if (project && tasksResource.error && !localTasks.data) {
    return (
      <ProjectSectionChrome
        projectRouteParam={routeParam}
        projectName={project.name}
        organizationRouteParam={organizationRouteParam}
        organizationContext={organizationContext}
      >
        <div className="error-state">
          <strong>Could not load tasks</strong>
          <p>{apiErrorMessage(tasksResource.error)}</p>
          <button type="button" onClick={tasksResource.reload}>
            Try again
          </button>
        </div>
      </ProjectSectionChrome>
    );
  }

  return (
    <ProjectSectionChrome
      projectRouteParam={routeParam}
      projectName={project?.name ?? null}
      organizationRouteParam={organizationRouteParam}
      organizationContext={organizationContext}
      loading={showContentLoading}
      loadingFallback={<TasksListSkeleton />}
    >
      {project ? (
        <ProjectTasksContent
          projectId={project.id}
          projectKey={project.key}
          initialView={initialView}
          tasks={tasks}
          contacts={contacts}
          defaultAssigneeId={null}
        />
      ) : null}
    </ProjectSectionChrome>
  );
}

export function ProjectTasksScreen({
  projectParam,
  organizationRouteParam,
}: {
  projectParam: string;
  organizationRouteParam?: string;
}) {
  return (
    <Suspense
      fallback={
        <ProjectSectionChrome
          projectRouteParam={projectParam}
          organizationRouteParam={organizationRouteParam}
          loading
          loadingFallback={<TasksListSkeleton />}
        />
      }
    >
      <ProjectTasksScreenInner
        projectParam={projectParam}
        organizationRouteParam={organizationRouteParam}
      />
    </Suspense>
  );
}
