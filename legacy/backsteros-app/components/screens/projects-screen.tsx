"use client";

import type { Project as ApiProject, Task as ApiTask } from "@backsteros/contracts";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ProjectsListShell } from "@/components/projects/projects-list-shell";
import { ProjectsListSkeleton } from "@/components/projects/projects-list-skeleton";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import { normalizeProject } from "@/lib/entity-normalize";
import { parseProjectsListView } from "@/lib/projects-list-view";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";
import { usePowerSyncQuery } from "@/lib/powersync-context";

function snakeToCamelProject(row: Record<string, unknown>): ApiProject {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output as ApiProject;
}

function ProjectsScreenInner() {
  const searchParams = useSearchParams();
  const resource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC",
  );
  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson("/api/v1/tasks"),
  );

  const projects = useMemo(() => {
    const rows =
      local.data?.map(snakeToCamelProject) ?? resource.data?.projects ?? [];
    return rows.map(normalizeProject);
  }, [local.data, resource.data]);

  const taskProgressByProjectId = useMemo(() => {
    const progress: Record<string, ProjectTaskProgress> = {};
    for (const task of tasksResource.data?.tasks ?? []) {
      if (!task.projectId) continue;
      const entry = progress[task.projectId] ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (task.status === "completed") entry.completed += 1;
      progress[task.projectId] = entry;
    }
    return progress;
  }, [tasksResource.data]);

  const initialView = parseProjectsListView(searchParams.get("view"));

  if (resource.loading && !local.data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <ProjectsListSkeleton />
      </div>
    );
  }

  if (resource.error && !local.data) {
    return (
      <div className="error-state">
        <strong>Could not load projects</strong>
        <p>{apiErrorMessage(resource.error)}</p>
        <button type="button" onClick={resource.reload}>Try again</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
      <ProjectsListShell
        projects={projects}
        taskProgressByProjectId={taskProgressByProjectId}
        initialView={initialView}
      />
    </div>
  );
}

export function ProjectsScreen() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          <ProjectsListSkeleton />
        </div>
      }
    >
      <ProjectsScreenInner />
    </Suspense>
  );
}
