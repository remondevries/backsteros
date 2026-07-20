import type { Project, Task } from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";
import { getTaskDisplayId } from "./task-display-id";
import { TASK_DETAIL_SELECT } from "./task-list-query";
import { useLocalQuery } from "./use-local-query";
import { useMobileApiClient } from "./use-mobile-api-client";

export type TaskDetailModel = {
  id: string;
  title: string;
  status: string | null;
  priority: number;
  due_date: string | null;
  project_id: string | null;
  assignee_id: string | null;
  project_name: string | null;
  project_key: string | null;
  assignee_name: string | null;
  display_id: string | null;
  description: string | null;
};

type SyncedDetailRow = {
  id: string;
  number: number | null;
  title: string | null;
  status: string | null;
  priority: number | null;
  due_date: string | null;
  project_id: string | null;
  contact_id: string | null;
  assignee_id: string | null;
  project_name: string | null;
  project_key: string | null;
  assignee_name: string | null;
  description: string | null;
};

function mapSyncedRow(row: SyncedDetailRow): TaskDetailModel {
  const assigneeId = row.assignee_id ?? row.contact_id;
  return {
    id: row.id,
    title: row.title ?? "Untitled",
    status: row.status,
    priority: row.priority ?? 0,
    due_date: row.due_date,
    project_id: row.project_id,
    assignee_id: assigneeId,
    project_name: row.project_name,
    project_key: row.project_key,
    assignee_name: row.assignee_name,
    display_id: getTaskDisplayId(
      {
        number: row.number,
        projectId: row.project_id,
        contactId: row.contact_id,
      },
      row.project_key,
    ),
    description: row.description,
  };
}

function mapApiTask(
  task: Task,
  project: Project | undefined,
  assigneeName: string | null,
): TaskDetailModel {
  const assigneeId = task.assigneeId ?? task.contactId;
  return {
    id: task.id,
    title: task.title || "Untitled",
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate,
    project_id: task.projectId,
    assignee_id: assigneeId,
    project_name: project?.name ?? null,
    project_key: project?.key ?? null,
    assignee_name: assigneeName,
    display_id: getTaskDisplayId(
      {
        number: task.number,
        projectId: task.projectId,
        contactId: task.contactId,
      },
      project?.key,
    ),
    description: task.description,
  };
}

const DETAIL_SQL = `${TASK_DETAIL_SELECT}
 WHERE t.id = ?
 LIMIT 1`;

const EMPTY_DETAIL_SQL = "SELECT 1 AS id WHERE 0";

export function useTaskDetail(taskId: string | undefined) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<SyncedDetailRow>(
      taskId ? DETAIL_SQL : EMPTY_DETAIL_SQL,
      taskId ? [taskId] : [],
    );

  const [restTask, setRestTask] = useState<TaskDetailModel | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const useRest = !powerSync.ready;

  const reloadRest = useCallback(async () => {
    if (!useRest || !taskId) return;
    setRestLoading(true);
    setRestError(null);
    try {
      const task = await client.requestJson<Task>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      );
      let project: Project | undefined;
      let assigneeName: string | null = null;
      const [projectsBody, contactsBody] = await Promise.all([
        client
          .requestJson<{ projects: Project[] }>("/api/v1/projects")
          .catch(() => ({ projects: [] as Project[] })),
        client
          .requestJson<{ contacts: { id: string; name: string | null }[] }>(
            "/api/v1/contacts",
          )
          .catch(() => ({ contacts: [] as { id: string; name: string | null }[] })),
      ]);
      if (task.projectId) {
        project = (projectsBody.projects ?? []).find(
          (entry) => entry.id === task.projectId,
        );
      }
      const assigneeId = task.assigneeId ?? task.contactId;
      if (assigneeId) {
        assigneeName =
          (contactsBody.contacts ?? []).find((entry) => entry.id === assigneeId)
            ?.name ?? null;
      }
      setRestTask(mapApiTask(task, project, assigneeName));
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
      setRestTask(null);
    } finally {
      setRestLoading(false);
    }
  }, [client, taskId, useRest]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const syncedTask = syncedRows?.[0] ? mapSyncedRow(syncedRows[0]) : null;
  const task = useRest ? restTask : syncedTask;
  const loading = useRest
    ? restLoading
    : Boolean(taskId) && syncLoading && !syncedTask;
  const error = useRest
    ? restError
    : !loading && taskId && !syncedTask
      ? "Task not found."
      : null;

  return {
    task,
    loading,
    error,
    retry: useRest ? reloadRest : powerSync.retry,
  };
}
