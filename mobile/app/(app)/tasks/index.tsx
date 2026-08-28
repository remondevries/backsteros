import type { Contact, Habit, Project, Task } from "@backsteros/contracts";
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

import { GroupedTaskList, type GroupedTaskRow } from "../../../components/grouped-task-list";
import { TaskBoardPane } from "../../../components/list-board/task-board-pane";
import type { HabitCheckChipItem } from "../../../components/tasks-today-habits-chips";
import { TasksHeader } from "../../../components/tasks-header";
import {
  TasksTodayHabitsChips,
  collapseHabitItemsByHabitId,
} from "../../../components/tasks-today-habits-chips";
import { useAgentMail } from "../../../lib/agentmail-context";
import { formatEmailDisplayId } from "../../../lib/email-display-id";
import {
  emailPartyLabel,
  resolveEmailListItemStatus,
} from "../../../lib/email-list";
import { useMobileCoreApiUrl } from "../../../lib/api-url-context";
import { listHabits, recordHabitDay } from "../../../lib/habits/api";
import { getTaskDueDateYmd } from "../../../lib/habits/dates";
import { getTodayJournalDateSlug } from "../../../lib/journal";
import {
  TASKS_LIST_BOARD_STORAGE_KEY,
  useListBoardView,
} from "../../../lib/list-board-view";
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
import { resolveSyncedOrRestRows } from "../../../lib/resolve-synced-or-rest-rows";
import { useRestListHydration } from "../../../lib/use-rest-list-hydration";
import { useRestReloadFlags } from "../../../lib/use-rest-reload-flags";
import { useSectionTabShortcuts } from "../../../lib/use-section-tab-shortcuts";

type SyncedHabitMeta = {
  id: string;
  title: string | null;
  icon: string | null;
  sort_order: number | null;
};

type SyncedHabitTask = {
  id: string;
  habit_id: string | null;
  title: string | null;
  status: string | null;
  due_date: string | null;
};

const HABITS_META_SQL = `SELECT id, title, icon, sort_order FROM habits
 WHERE deleted_at IS NULL`;

const HABIT_TASKS_SQL = `SELECT id, habit_id, title, status, due_date FROM tasks
 WHERE deleted_at IS NULL
   AND habit_id IS NOT NULL
   AND status IS NOT 'canceled'`;

export default function TasksScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const powerSync = useMobilePowerSync();
  const [dueFilter, setDueFilterState] = useState<TasksDueFilter>(
    getRememberedTasksDueFilter,
  );
  const client = useMobileApiClient();
  const { view: boardView, toggleView: toggleBoardView } = useListBoardView(
    TASKS_LIST_BOARD_STORAGE_KEY,
  );

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
        <TasksHeader
          dueFilter={dueFilter}
          onDueFilterChange={setDueFilter}
          boardView={boardView}
          onBoardViewToggle={toggleBoardView}
        />
      ),
    });
  }, [boardView, dueFilter, navigation, setDueFilter, toggleBoardView]);

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
       AND t.habit_id IS NULL
     ORDER BY t.sort_order ASC, t.updated_at DESC`,
  );
  const { data: syncedHabits } = useLocalQuery<SyncedHabitMeta>(HABITS_META_SQL);
  const { data: syncedHabitTasks } =
    useLocalQuery<SyncedHabitTask>(HABIT_TASKS_SQL);

  const [habitCheckedOverride, setHabitCheckedOverride] = useState<
    Partial<Record<string, boolean>>
  >({});
  /** Server habit list (runs day rollover) — fills Today chips before PowerSync catches up. */
  const [rolledHabits, setRolledHabits] = useState<Habit[] | null>(null);

  const refreshHabitRollover = useCallback(async () => {
    try {
      const habits = await listHabits(client);
      setRolledHabits(habits);
    } catch {
      // Keep last successful rollover; chips still use PowerSync when available.
    }
  }, [client]);

  useEffect(() => {
    void refreshHabitRollover();
  }, [refreshHabitRollover]);

  const [restRows, setRestRows] = useState<GroupedTaskRow[] | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  } = useRestReloadFlags();

  const localRows = useMemo(
    () => (syncedTasks ?? []).map((row) => withDisplayId(row)),
    [syncedTasks],
  );

  const reloadRest = useCallback(async (opts?: { userPull?: boolean }) => {
    const userPull = beginReload(opts);
    setRestError(null);
    try {
      const [tasksBody, projectsBody, contactsBody] = await Promise.all([
        client.requestJson<{ tasks: Task[] }>("/api/v1/tasks"),
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
        client
          .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
          .catch(() => ({ contacts: [] as Contact[] })),
        refreshHabitRollover(),
      ]);
      const projectsById = new Map(
        (projectsBody.projects ?? []).map((project) => [project.id, project]),
      );
      const contactsById = contactsByIdFromList(contactsBody.contacts ?? []);
      setRestRows(
        (tasksBody.tasks ?? [])
          .filter((task) => !task.habitId)
          .map((task) => mapApiTaskToRow(task, projectsById, contactsById)),
      );
      markHydrated();
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        isNetworkError(detail) ? formatNetworkError() : detail,
      );
    } finally {
      endReload(userPull);
    }
  }, [beginReload, client, endReload, formatNetworkError, isNetworkError, markHydrated, refreshHabitRollover]);

  useRestListHydration(reloadRest, true, localRows.length > 0);

  const allRows = useMemo(
    () =>
      resolveSyncedOrRestRows({
        localRows,
        restRows,
        connected: powerSync.connected,
      }),
    [localRows, powerSync.connected, restRows],
  );

  // Email thread rows alongside tasks — desktop Tasks page parity. The due
  // filter applies the same way (emails without a due date show under All).
  const { messages: emailMessages } = useAgentMail();
  const emailRows = useMemo<GroupedTaskRow[]>(
    () =>
      emailMessages.map((item) => ({
        id: `email::${item.inboxId}::${item.id}`,
        title: item.subject?.trim() || "(no subject)",
        status: resolveEmailListItemStatus(item),
        priority: item.priority ?? 0,
        due_date: item.dueDate ?? null,
        project_name: item.projectName ?? null,
        project_key: item.projectKey ?? null,
        display_id:
          item.displayId ??
          (item.number != null ? formatEmailDisplayId(item.number) : null),
        item_type: "email" as const,
        email_from: item.contactName?.trim() || emailPartyLabel(item.from),
        email_inbox_id: item.inboxId,
        email_message_id: item.id,
      })),
    [emailMessages],
  );

  const rows = useMemo(
    () => filterTasksByDueFilter([...allRows, ...emailRows], dueFilter),
    [allRows, dueFilter, emailRows],
  );

  const todayHabits = useMemo((): HabitCheckChipItem[] => {
    const todayYmd = getTodayJournalDateSlug();
    const habitById = new Map(
      (syncedHabits ?? []).map((habit) => [habit.id, habit] as const),
    );
    const fromSync = (syncedHabitTasks ?? [])
      .filter(
        (task) =>
          Boolean(task.habit_id) &&
          task.status !== "canceled" &&
          getTaskDueDateYmd(task.due_date) === todayYmd,
      )
      .map((task) => {
        const habit = habitById.get(task.habit_id!);
        const rolled = rolledHabits?.find((entry) => entry.id === task.habit_id);
        return {
          habitId: task.habit_id!,
          taskId: task.id,
          title: habit?.title ?? rolled?.title ?? task.title ?? "Habit",
          icon: habit?.icon ?? rolled?.icon ?? null,
          checked:
            habitCheckedOverride[task.id] ?? task.status === "completed",
          sortOrder: habit?.sort_order ?? rolled?.sortOrder ?? 0,
        };
      });

    const seenHabitIds = new Set(fromSync.map((item) => item.habitId));
    const fromRollover = (rolledHabits ?? [])
      .filter(
        (habit) =>
          Boolean(habit.todayTaskId) &&
          habit.todayTaskStatus !== "canceled" &&
          !seenHabitIds.has(habit.id),
      )
      .map((habit) => ({
        habitId: habit.id,
        taskId: habit.todayTaskId!,
        title: habit.title,
        icon: habit.icon ?? null,
        checked:
          habitCheckedOverride[habit.todayTaskId!] ??
          habit.todayTaskStatus === "completed",
        sortOrder: habit.sortOrder ?? 0,
      }));

    return collapseHabitItemsByHabitId(
      [...fromSync, ...fromRollover]
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      })
      .map(({ sortOrder: _sortOrder, ...item }) => item),
    );
  }, [
    habitCheckedOverride,
    rolledHabits,
    syncedHabitTasks,
    syncedHabits,
  ]);

  const onToggleTodayHabit = useCallback(
    (item: HabitCheckChipItem, checked: boolean) => {
      setHabitCheckedOverride((current) => ({
        ...current,
        [item.taskId]: checked,
      }));
      void recordHabitDay(client, item.habitId, {
        dueYmd: getTodayJournalDateSlug(),
        status: checked ? "completed" : "canceled",
      }).catch(() => {
        setHabitCheckedOverride((current) => {
          const next = { ...current };
          delete next[item.taskId];
          return next;
        });
      });
    },
    [client],
  );

  const waitingForSync =
    allRows.length === 0 &&
    restRows == null &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading);

  const loading =
    allRows.length === 0 && (restLoading || waitingForSync || syncLoading);
  const error =
    allRows.length === 0 && restError && !powerSync.connected
      ? restError
      : null;

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      // Stay inside the Tasks tab stack so the due-filter tab + list state survive back.
      if (
        row.item_type === "email" &&
        row.email_inbox_id &&
        row.email_message_id
      ) {
        router.push(
          `/(app)/tasks/email/${encodeURIComponent(row.email_inbox_id)}/${encodeURIComponent(row.email_message_id)}` as const,
        );
        return;
      }
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

  if (boardView === "board") {
    return <TaskBoardPane rows={rows} onPressRow={onPressRow} />;
  }

  return (
    <GroupedTaskList
      rows={rows}
      emptyText={
        dueFilter === "today" && todayHabits.length > 0
          ? ""
          : getTasksDueFilterEmptyMessage(dueFilter)
      }
      refreshing={pullRefreshing}
      onRefresh={() => void reloadRest({ userPull: true })}
      listHeader={
        dueFilter === "today" ? (
          <TasksTodayHabitsChips
            items={todayHabits}
            onToggle={onToggleTodayHabit}
          />
        ) : null
      }
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
