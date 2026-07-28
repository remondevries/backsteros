import type { Contact, Project, Task } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  GroupedTaskList,
  type GroupedTaskRow,
} from "../../../components/grouped-task-list";
import { TasksHeader } from "../../../components/tasks-header";
import { getMobileEnvironment } from "../../../lib/env";
import {
  contactsByIdFromList,
  mapApiTaskToRow,
  withDisplayId,
} from "../../../lib/map-task-row";
import { useMobilePowerSync } from "../../../lib/powersync-context";
import { TASK_LIST_SELECT } from "../../../lib/task-list-query";
import {
  getRememberedTasksDueFilter,
  rememberTasksDueFilter,
} from "../../../lib/tasks-due-filter-memory";
import {
  filterTasksByDueFilter,
  getTasksDueFilterEmptyMessage,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "../../../lib/tasks-due-filters";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useLocalQuery } from "../../../lib/use-local-query";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { useRestFallbackGate } from "../../../lib/use-rest-fallback-gate";
import { useSectionTabShortcuts } from "../../../lib/use-section-tab-shortcuts";

export default function TasksScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const [dueFilter, setDueFilterState] = useState<TasksDueFilter>(
    getRememberedTasksDueFilter,
  );
  const client = useMobileApiClient();

  const setDueFilter = useCallback((filter: TasksDueFilter) => {
    rememberTasksDueFilter(filter);
    setDueFilterState(filter);
  }, []);

  const onDueFilterTabIndex = useCallback(
    (index: number) => {
      const next = TASKS_DUE_FILTERS[index];
      if (next) setDueFilter(next);
    },
    [setDueFilter],
  );

  useSectionTabShortcuts({
    sectionCount: TASKS_DUE_FILTERS.length,
    onSelectIndex: onDueFilterTabIndex,
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <TasksHeader dueFilter={dueFilter} onDueFilterChange={setDueFilter} />
      ),
    });
  }, [dueFilter, navigation, setDueFilter]);

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

  const localRows = useMemo(
    () => (syncedTasks ?? []).map((row) => withDisplayId(row)),
    [syncedTasks],
  );

  const useRest = useRestFallbackGate(localRows.length);

  const reloadRest = useCallback(async () => {
    setRestLoading(true);
    setRestError(null);
    try {
      const [tasksBody, projectsBody, contactsBody] = await Promise.all([
        client.requestJson<{ tasks: Task[] }>("/api/v1/tasks"),
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
        client
          .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
          .catch(() => ({ contacts: [] as Contact[] })),
      ]);
      const projectsById = new Map(
        (projectsBody.projects ?? []).map((project) => [project.id, project]),
      );
      const contactsById = contactsByIdFromList(contactsBody.contacts ?? []);
      setRestRows(
        (tasksBody.tasks ?? []).map((task) =>
          mapApiTaskToRow(task, projectsById, contactsById),
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
  }, [apiUrl, client]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const allRows: GroupedTaskRow[] =
    localRows.length > 0 ? localRows : restRows;

  const rows = useMemo(
    () => filterTasksByDueFilter(allRows, dueFilter),
    [allRows, dueFilter],
  );

  const waitingForSync =
    localRows.length === 0 &&
    !useRest &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading);

  const loading =
    allRows.length === 0 &&
    (useRest ? restLoading : waitingForSync || syncLoading);
  const error = useRest && allRows.length === 0 ? restError : null;

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      // Stay inside the Tasks tab stack so the due-filter tab + list state survive back.
      router.push(`/(app)/tasks/${row.id}`);
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
      onRefresh={useRest ? () => void reloadRest() : undefined}
      onPressRow={onPressRow}
      onAddToStatus={(status) => {
        router.push({
          pathname: "/create/task",
          params: {
            status,
            ...(dueFilter !== "all" ? { dueFilter } : {}),
          },
        });
      }}
    />
  );
}
