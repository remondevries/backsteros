import { useMemo } from "react";

import { migrateLegacyProjectType } from "./project-type";
import { useMobilePowerSync } from "./powersync-context";
import { getTaskDisplayId } from "./task-display-id";
import { TASK_DETAIL_SELECT } from "./task-list-query";
import { useLocalQuery } from "./use-local-query";

export type TaskDetailModel = {
  id: string;
  number: number | null;
  title: string;
  status: string | null;
  priority: number;
  due_date: string | null;
  project_id: string | null;
  assignee_id: string | null;
  project_name: string | null;
  project_key: string | null;
  project_type: string | null;
  project_local_working_directory: string | null;
  assignee_name: string | null;
  display_id: string | null;
  description: string | null;
  agent_chat_id: string | null;
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
  project_type: string | null;
  project_local_working_directory: string | null;
  assignee_name: string | null;
  description: string | null;
  agent_chat_id: string | null;
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
    project_id: row.project_id,
    assignee_id: assigneeId,
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
  };
}

const DETAIL_SQL = `${TASK_DETAIL_SELECT}
 WHERE t.id = ?
 LIMIT 1`;

const EMPTY_DETAIL_SQL = "SELECT 1 AS id WHERE 0";

export function useTaskDetail(taskId: string | undefined) {
  const powerSync = useMobilePowerSync();

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<SyncedDetailRow>(
      taskId ? DETAIL_SQL : EMPTY_DETAIL_SQL,
      taskId ? [taskId] : [],
    );

  const syncedTask = syncedRows?.[0] ? mapSyncedRow(syncedRows[0]) : null;
  const task = syncedTask;
  const loading =
    Boolean(taskId) &&
    !syncedTask &&
    powerSync.status !== "error" &&
    (syncLoading || !powerSync.ready);
  const error =
    !loading && taskId && !syncedTask
      ? powerSync.status === "error"
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
    retry: powerSync.retry,
    isCodebaseTask,
  };
}
