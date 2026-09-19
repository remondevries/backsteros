"use client";

import type {
  ProjectUpdate,
  ProjectUpdateKind,
  ProjectUpdateSeverity,
  ProjectUpdateStatus,
} from "@backsteros/contracts";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectSectionHref,
  getScopedProjectTaskHref,
  primeTabTitle,
  ProjectUpdatesView,
} from "@backsteros/ui";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDesktopApi } from "../lib/api-context";
import { useShellLocation } from "../lib/shell-route-keep-alive";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

type DesktopProjectUpdatesPanelProps = {
  projectId: string;
};

export function DesktopProjectUpdatesPanel({
  projectId,
}: DesktopProjectUpdatesPanelProps) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const routerNavigate = useNavigate();
  const { pathname } = useShellLocation();
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relatedTaskOptions = useMemo(
    () =>
      workspace.allTasks
        .filter(
          (task) =>
            task.projectId === projectId &&
            (task.listKind == null || task.listKind === "task"),
        )
        .map((task) => ({
          id: task.id,
          number: task.number,
          title: task.title,
          status: task.status,
          projectKey: task.projectKey ?? null,
        })),
    [projectId, workspace.allTasks],
  );

  const projectKey = useMemo(() => {
    const project = workspace.projects.find((entry) => entry.id === projectId);
    return project?.key ?? null;
  }, [projectId, workspace.projects]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.requestJson<{ updates: ProjectUpdate[] }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/updates`,
      );
      setUpdates(result.updates ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load updates";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = useCallback(
    async (input: {
      title: string;
      body: string;
      kind: ProjectUpdateKind;
      status: ProjectUpdateStatus;
      severity: ProjectUpdateSeverity | null;
    }) => {
      setPosting(true);
      setError(null);
      try {
        const created = await client.requestJson<ProjectUpdate>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/updates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        setUpdates((current) => [created, ...current]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to post update";
        setError(message);
        throw err;
      } finally {
        setPosting(false);
      }
    },
    [client, projectId],
  );

  const onPatch = useCallback(
    async (
      id: string,
      patch: Partial<{
        title: string;
        body: string;
        kind: ProjectUpdateKind;
        status: ProjectUpdateStatus;
        severity: ProjectUpdateSeverity | null;
        relatedTaskIds: string[];
      }>,
    ) => {
      setError(null);
      try {
        const updated = await client.requestJson<ProjectUpdate>(
          `/api/v1/project-updates/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setUpdates((current) =>
          current.map((entry) => (entry.id === id ? updated : entry)),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update post";
        setError(message);
        throw err;
      }
    },
    [client],
  );

  const onDelete = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await client.requestJson(
          `/api/v1/project-updates/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        setUpdates((current) => current.filter((entry) => entry.id !== id));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete post";
        setError(message);
        throw err;
      }
    },
    [client],
  );

  const onOpenRelatedTask = useCallback(
    (taskId: string) => {
      const task =
        relatedTaskOptions.find((entry) => entry.id === taskId) ??
        workspace.allTasks.find((entry) => entry.id === taskId) ??
        null;
      const key = projectKey ?? task?.projectKey ?? null;
      const scope = getProjectRouteScopeFromPathname(pathname);
      const href =
        key && task?.number != null
          ? getScopedProjectTaskHref(key, task.number, scope)
          : key
            ? `${getScopedProjectSectionHref(key, "tasks", scope)}/${encodeURIComponent(taskId)}`
            : `/tasks/${encodeURIComponent(taskId)}`;
      if (task?.title) {
        primeTabTitle(href, task.title);
      }
      navigateToHref(routerNavigate, href);
    },
    [pathname, projectKey, relatedTaskOptions, routerNavigate, workspace.allTasks],
  );

  return (
    <div className="project-detail__updates">
      <ProjectUpdatesView
        updates={updates}
        loading={loading}
        posting={posting}
        error={error}
        relatedTaskOptions={relatedTaskOptions}
        onCreate={onCreate}
        onPatch={onPatch}
        onDelete={onDelete}
        onOpenRelatedTask={onOpenRelatedTask}
      />
    </div>
  );
}
