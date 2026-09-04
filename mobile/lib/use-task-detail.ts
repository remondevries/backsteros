import type { Contact, Project, Task } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import { migrateLegacyProjectType } from "./project-type";
import { useMobilePowerSync } from "./powersync-context";
import {
  clearPendingTaskDetail,
  usePendingTaskDetail,
} from "./pending-task-detail";
import { getTaskDisplayId } from "./task-display-id";
import { TASK_DETAIL_SELECT } from "./task-list-query";
import { useLocalQuery } from "./use-local-query";
import { useMobileApiClient } from "./use-mobile-api-client";
import { shouldFetchTaskDetailViaRest } from "./should-fetch-task-detail-via-rest";

export type TaskDetailModel = {
  id: string;
  number: number | null;
  title: string;
  status: string | null;
  priority: number;
  due_date: string | null;
  due_end_date: string | null;
  project_id: string | null;
  assignee_id: string | null;
  related_contact_ids: string | null;
  related_organization_ids: string | null;
  project_name: string | null;
  project_key: string | null;
  project_type: string | null;
  project_local_working_directory: string | null;
  assignee_name: string | null;
  display_id: string | null;
  description: string | null;
  agent_chat_id: string | null;
  agent_created_at: string | null;
  agent_inbox_approved_at: string | null;
  tracked_minutes: number | null;
  tracked_duration_seconds: number | null;
};

type SyncedDetailRow = {
  id: string;
  number: number | null;
  title: string | null;
  status: string | null;
  priority: number | null;
  due_date: string | null;
  due_end_date: string | null;
  project_id: string | null;
  contact_id: string | null;
  assignee_id: string | null;
  related_contact_ids: string | null;
  related_organization_ids: string | null;
  project_name: string | null;
  project_key: string | null;
  project_type: string | null;
  project_local_working_directory: string | null;
  assignee_name: string | null;
  description: string | null;
  agent_chat_id: string | null;
  agent_created_at: string | null;
  agent_inbox_approved_at: string | null;
  tracked_minutes: number | null;
  tracked_duration_seconds: number | null;
};

function mapSyncedRow(row: SyncedDetailRow): TaskDetailModel {
  const assigneeId = row.assignee_id ?? row.contact_id;
  return {
    id: row.id,
    number: row.number,
    title: row.title ?? "Untitled",
    status: row.status,
    priority: row.priority ?? 0,
    due_date: row.due_date,
    due_end_date: row.due_end_date ?? null,
    project_id: row.project_id,
    assignee_id: assigneeId,
    related_contact_ids: row.related_contact_ids ?? null,
    related_organization_ids: row.related_organization_ids ?? null,
    project_name: row.project_name,
    project_key: row.project_key,
    project_type: row.project_type
      ? migrateLegacyProjectType(row.project_type)
      : null,
    project_local_working_directory: row.project_local_working_directory,
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
    agent_chat_id: row.agent_chat_id,
    agent_created_at: row.agent_created_at ?? null,
    agent_inbox_approved_at: row.agent_inbox_approved_at ?? null,
    tracked_minutes: row.tracked_minutes ?? null,
    tracked_duration_seconds: row.tracked_duration_seconds ?? null,
  };
}

function mapApiTask(
  task: Task,
  project: Project | null,
  assignee: Contact | null,
): TaskDetailModel {
  const assigneeId = task.assigneeId ?? task.contactId;
  return {
    id: task.id,
    number: task.number,
    title: task.title ?? "Untitled",
    status: task.status,
    priority: task.priority ?? 0,
    due_date: task.dueDate,
    due_end_date: task.dueEndDate ?? null,
    project_id: task.projectId,
    assignee_id: assigneeId,
    related_contact_ids: JSON.stringify(task.relatedContactIds ?? []),
    related_organization_ids: JSON.stringify(
      task.relatedOrganizationIds ?? [],
    ),
    project_name: project?.name ?? null,
    project_key: project?.key ?? null,
    project_type: project?.type
      ? migrateLegacyProjectType(project.type)
      : null,
    project_local_working_directory: project?.localWorkingDirectory ?? null,
    assignee_name: assignee?.name?.trim() || null,
    display_id: getTaskDisplayId(
      {
        number: task.number,
        projectId: task.projectId,
        contactId: task.contactId,
      },
      project?.key,
    ),
    description: task.description,
    agent_chat_id: task.agentChatId,
    agent_created_at: task.agentCreatedAt ?? null,
    agent_inbox_approved_at: task.agentInboxApprovedAt ?? null,
    tracked_minutes: task.trackedMinutes ?? null,
    tracked_duration_seconds: task.trackedDurationSeconds ?? null,
  };
}

const DETAIL_SQL = `${TASK_DETAIL_SELECT}
 WHERE t.id = ?
   AND t.deleted_at IS NULL
 LIMIT 1`;

const EMPTY_DETAIL_SQL = "SELECT 1 AS id WHERE 0";

export function useTaskDetail(taskId: string | undefined) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const pendingTask = usePendingTaskDetail(taskId);

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<SyncedDetailRow>(
      taskId ? DETAIL_SQL : EMPTY_DETAIL_SQL,
      taskId ? [taskId] : [],
    );

  const syncedTask = useMemo(
    () => (syncedRows?.[0] ? mapSyncedRow(syncedRows[0]) : null),
    [syncedRows],
  );

  useEffect(() => {
    if (taskId && syncedTask) clearPendingTaskDetail(taskId);
  }, [syncedTask, taskId]);

  const useRest = shouldFetchTaskDetailViaRest({
    taskId,
    hasSyncedTask: Boolean(syncedTask),
    hasPendingTask: Boolean(pendingTask),
    syncLoading,
    powerSyncStatus: powerSync.status,
    powerSyncReady: powerSync.ready,
    restFallbackAllowed: powerSync.restFallbackAllowed,
  });

  const [restTask, setRestTask] = useState<TaskDetailModel | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const reloadRest = useCallback(async () => {
    if (!taskId) {
      setRestTask(null);
      setRestError(null);
      setRestLoading(false);
      return;
    }
    setRestLoading(true);
    setRestError(null);
    try {
      const task = await client.requestJson<Task>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      );
      const assigneeId = task.assigneeId ?? task.contactId;
      const [project, assignee] = await Promise.all([
        task.projectId
          ? client
              .requestJson<Project>(
                `/api/v1/projects/${encodeURIComponent(task.projectId)}`,
              )
              .catch(() => null)
          : Promise.resolve(null),
        assigneeId
          ? client
              .requestJson<Contact>(
                `/api/v1/contacts/${encodeURIComponent(assigneeId)}`,
              )
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      setRestTask(mapApiTask(task, project, assignee));
      clearPendingTaskDetail(taskId);
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
      setRestTask(null);
    } finally {
      setRestLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    setRestTask(null);
    setRestError(null);
  }, [taskId]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const task = syncedTask ?? restTask ?? pendingTask;

  const waitingForSync =
    Boolean(taskId) &&
    !task &&
    !useRest &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading ||
      !powerSync.ready);

  const loading =
    Boolean(taskId) &&
    !task &&
    (useRest ? restLoading : waitingForSync);

  const error =
    !loading && taskId && !task
      ? useRest
        ? restError ?? "Task not found."
        : powerSync.status === "error"
          ? powerSync.message
          : "Task not found."
      : null;

  const isCodebaseTask = useMemo(
    () => task?.project_type === "codebase" && Boolean(task.project_id),
    [task?.project_id, task?.project_type],
  );

  return {
    task,
    loading,
    error,
    retry: useRest ? () => void reloadRest() : powerSync.retry,
    isCodebaseTask,
  };
}
