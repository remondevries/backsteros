import type { Project, Task } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { taskDetailHref } from "../lib/detail-href";
import { getMobileEnvironment } from "../lib/env";
import { mapApiTaskToRow, withDisplayId } from "../lib/map-task-row";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { GroupedTaskList, type GroupedTaskRow } from "./grouped-task-list";

type SyncedTaskRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  project_key?: string | null;
};

type Props = {
  projectId: string;
};

const TASKS_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL
   AND t.project_id = ?
 ORDER BY t.sort_order ASC, t.updated_at DESC`;

/** Same grouped task list as the Tasks tab, scoped to one project. */
export function ProjectTasksPanel({ projectId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { apiUrl } = getMobileEnvironment();

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
    },
    [apiUrl],
  );

  const { rows, loading, error, useRest, restLoading, reload } =
    useSyncedOrRest<SyncedTaskRow, GroupedTaskRow>({
      sql: TASKS_SQL,
      params: [projectId],
      mapLocal: (synced) => synced.map((row) => withDisplayId(row)),
      fetchRest: async () => {
        try {
          const [tasksBody, projectsBody] = await Promise.all([
            client.requestJson<{ tasks: Task[] }>(
              `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}`,
            ),
            client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
          ]);
          const projectsById = new Map(
            (projectsBody.projects ?? []).map((project) => [
              project.id,
              project,
            ]),
          );
          return (tasksBody.tasks ?? [])
            .filter((task) => task.projectId === projectId)
            .map((task) => mapApiTaskToRow(task, projectsById));
        } catch (reason) {
          return mapNetworkError(reason);
        }
      },
    });

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      router.push(taskDetailHref(row.id));
    },
    [router],
  );

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return <Text style={ui.error}>{error}</Text>;
  }

  return (
    <GroupedTaskList
      rows={rows}
      emptyText="No tasks in this project."
      refreshing={useRest ? restLoading : false}
      onRefresh={() => {
        void reload();
      }}
      onPressRow={onPressRow}
    />
  );
}
