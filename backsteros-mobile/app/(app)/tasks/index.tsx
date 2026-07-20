import type { Project, Task } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  GroupedTaskList,
  type GroupedTaskRow,
} from "../../../components/grouped-task-list";
import { TasksHeader } from "../../../components/tasks-header";
import { taskDetailHref } from "../../../lib/detail-href";
import { getMobileEnvironment } from "../../../lib/env";
import { mapApiTaskToRow, withDisplayId } from "../../../lib/map-task-row";
import { useMobilePowerSync } from "../../../lib/powersync-context";
import { TASK_LIST_SELECT } from "../../../lib/task-list-query";
import {
  DEFAULT_TASKS_DUE_FILTER,
  filterTasksByDueFilter,
  getTasksDueFilterEmptyMessage,
  type TasksDueFilter,
} from "../../../lib/tasks-due-filters";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useLocalQuery } from "../../../lib/use-local-query";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";

export default function TasksScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const [dueFilter, setDueFilter] = useState<TasksDueFilter>(
    DEFAULT_TASKS_DUE_FILTER,
  );
  const client = useMobileApiClient();

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <TasksHeader dueFilter={dueFilter} onDueFilterChange={setDueFilter} />
      ),
    });
  }, [dueFilter, navigation]);

  const { data: syncedTasks, isLoading: syncLoading } = useLocalQuery<
    GroupedTaskRow & {
      number?: number | null;
      project_id?: string | null;
      contact_id?: string | null;
      project_key?: string | null;
    }
  >(
    `${TASK_LIST_SELECT}
     WHERE t.deleted_at IS NULL
     ORDER BY t.sort_order ASC, t.updated_at DESC`,
  );

  const [restRows, setRestRows] = useState<GroupedTaskRow[]>([]);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const useRest = !powerSync.ready;

  const reloadRest = useCallback(async () => {
    if (powerSync.ready) return;
    setRestLoading(true);
    setRestError(null);
    try {
      const [tasksBody, projectsBody] = await Promise.all([
        client.requestJson<{ tasks: Task[] }>("/api/v1/tasks"),
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
      ]);
      const projectsById = new Map(
        (projectsBody.projects ?? []).map((project) => [project.id, project]),
      );
      setRestRows(
        (tasksBody.tasks ?? []).map((task) =>
          mapApiTaskToRow(task, projectsById),
        ),
      );
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
      setRestRows([]);
    } finally {
      setRestLoading(false);
    }
  }, [apiUrl, client, powerSync.ready]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const localRows = useMemo(
    () => (syncedTasks ?? []).map((row) => withDisplayId(row)),
    [syncedTasks],
  );
  const allRows: GroupedTaskRow[] =
    powerSync.ready || localRows.length > 0 ? localRows : restRows;

  const rows = useMemo(
    () => filterTasksByDueFilter(allRows, dueFilter),
    [allRows, dueFilter],
  );

  const loading =
    allRows.length === 0 && (useRest ? restLoading : syncLoading);
  const error = useRest && allRows.length === 0 ? restError : null;

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
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{error}</Text>
      </View>
    );
  }

  return (
    <GroupedTaskList
      rows={rows}
      emptyText={getTasksDueFilterEmptyMessage(dueFilter)}
      refreshing={useRest ? restLoading : false}
      onRefresh={() => {
        if (useRest) void reloadRest();
        else void powerSync.retry();
      }}
      onPressRow={onPressRow}
    />
  );
}
