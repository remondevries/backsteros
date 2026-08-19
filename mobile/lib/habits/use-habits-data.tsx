import type { Habit, HabitCadence, Task } from "@backsteros/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getTodayJournalDateSlug } from "../journal";
import { useMobileApiClient } from "../use-mobile-api-client";
import { useSyncedOrRest } from "../use-synced-or-rest";
import {
  createHabit,
  listHabits,
  recordHabitDay,
  softDeleteTask,
  updateHabit,
} from "./api";
import { getTaskDueDateYmd } from "./dates";
import type { HabitGridInstance } from "./habit-month-grid";

export type HabitListItem = Habit & {
  checked: boolean;
};

export type HabitsData = {
  items: HabitListItem[];
  projects: Array<{
    id: string;
    name: string;
    icon: string | null;
    type: string | null;
  }>;
  todayYmd: string;
  loading: boolean;
  error: string | null;
  pullRefreshing: boolean;
  reload: (opts?: { userPull?: boolean }) => Promise<void>;
  instancesForHabit: (habitId: string | null) => HabitGridInstance[];
  onCreateHabit: (input: {
    title: string;
    icon: string | null;
  }) => Promise<void>;
  onUpdateHabit: (
    id: string,
    input: {
      title?: string;
      cadence?: HabitCadence;
      projectId?: string;
      icon?: string | null;
      description?: string | null;
      nextDueYmd?: string;
    },
  ) => Promise<void>;
  onRecordDay: (
    habitId: string,
    input: { dueYmd: string; status: "completed" | "canceled" },
  ) => Promise<void>;
  onToggleToday: (habit: HabitListItem, checked: boolean) => Promise<void>;
  onDeleteDay: (taskId: string) => Promise<void>;
};

const HabitsDataContext = createContext<HabitsData | null>(null);

type SyncedHabitRow = {
  id: string;
  title: string | null;
  icon: string | null;
  description: string | null;
  project_id: string | null;
  cadence: string | null;
  cadence_anchor_ymd: string | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type SyncedTaskRow = {
  id: string;
  habit_id: string | null;
  title: string | null;
  status: string | null;
  due_date: string | null;
};

type SyncedProjectRow = {
  id: string;
  name: string | null;
  icon: string | null;
  type: string | null;
};

const HABITS_SQL = `SELECT id, title, icon, description, project_id, cadence, cadence_anchor_ymd,
  sort_order, created_at, updated_at, deleted_at
 FROM habits
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, title COLLATE NOCASE ASC`;

const HABIT_TASKS_SQL = `SELECT id, habit_id, title, status, due_date
 FROM tasks
 WHERE deleted_at IS NULL
   AND habit_id IS NOT NULL`;

const PROJECTS_SQL = `SELECT id, name, icon, type FROM projects
 WHERE deleted_at IS NULL
 ORDER BY name COLLATE NOCASE ASC`;

function mapSyncedHabit(row: SyncedHabitRow, todayTask?: SyncedTaskRow | null): Habit {
  const todayStatus = todayTask?.status ?? null;
  return {
    id: row.id,
    title: row.title ?? "Untitled",
    icon: row.icon,
    description: row.description,
    projectId: row.project_id ?? "",
    cadence: (row.cadence as HabitCadence) ?? "daily",
    cadenceAnchorYmd:
      row.cadence_anchor_ymd ?? getTodayJournalDateSlug(),
    sortOrder: row.sort_order ?? 0,
    todayTaskId: todayTask?.id ?? null,
    todayTaskStatus: (todayStatus as Habit["todayTaskStatus"]) ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at,
  };
}

/** Background hydrate — never spins the list RefreshControl. */
const SILENT_RELOAD = { userPull: false } as const;

function useHabitsDataState(): HabitsData {
  const client = useMobileApiClient();
  const todayYmd = getTodayJournalDateSlug();
  const [checkedOverride, setCheckedOverride] = useState<
    Partial<Record<string, boolean>>
  >({});

  const habitsQuery = useSyncedOrRest<SyncedHabitRow, Habit>({
    sql: HABITS_SQL,
    mapLocal: (rows) =>
      rows.map((row) => mapSyncedHabit(row)),
    fetchRest: () => listHabits(client),
  });

  const tasksQuery = useSyncedOrRest<SyncedTaskRow, SyncedTaskRow>({
    sql: HABIT_TASKS_SQL,
    mapLocal: (rows) => rows,
    fetchRest: async () => {
      const response = await client.requestJson<{ tasks: Task[] }>(
        "/api/v1/tasks",
      );
      return response.tasks
        .filter((task) => Boolean(task.habitId))
        .map((task) => ({
          id: task.id,
          habit_id: task.habitId ?? null,
          title: task.title ?? null,
          status: task.status ?? null,
          due_date:
            typeof task.dueDate === "string"
              ? task.dueDate
              : task.dueDate
                ? new Date(task.dueDate).toISOString()
                : null,
        }));
    },
  });

  const projectsQuery = useSyncedOrRest<SyncedProjectRow, SyncedProjectRow>({
    sql: PROJECTS_SQL,
    mapLocal: (rows) => rows,
    fetchRest: async () => {
      const response = await client.requestJson<{ projects: Array<{
        id: string;
        name: string;
        icon: string | null;
        type: string | null;
      }> }>("/api/v1/projects");
      return response.projects.map((project) => ({
        id: project.id,
        name: project.name,
        icon: project.icon,
        type: project.type,
      }));
    },
  });

  const todayTaskByHabitId = useMemo(() => {
    const map = new Map<string, SyncedTaskRow>();
    for (const task of tasksQuery.rows) {
      if (!task.habit_id) continue;
      const due = getTaskDueDateYmd(task.due_date);
      if (due !== todayYmd) continue;
      map.set(task.habit_id, task);
    }
    return map;
  }, [tasksQuery.rows, todayYmd]);

  const items: HabitListItem[] = useMemo(() => {
    return habitsQuery.rows.map((habit) => {
      const todayTask = todayTaskByHabitId.get(habit.id);
      // Prefer live task rows for "due today"; clear stale todayTaskId from REST.
      const merged =
        todayTask != null
          ? {
              ...habit,
              todayTaskId: todayTask.id,
              todayTaskStatus:
                (todayTask.status as Habit["todayTaskStatus"]) ?? null,
            }
          : {
              ...habit,
              todayTaskId: null,
              todayTaskStatus: null,
            };
      const serverChecked = merged.todayTaskStatus === "completed";
      const checked =
        checkedOverride[habit.id] !== undefined
          ? Boolean(checkedOverride[habit.id])
          : serverChecked;
      return {
        ...merged,
        checked,
      };
    });
  }, [checkedOverride, habitsQuery.rows, todayTaskByHabitId]);

  // Drop overrides once the server/local snapshot matches.
  useEffect(() => {
    setCheckedOverride((current) => {
      const keys = Object.keys(current);
      if (keys.length === 0) return current;
      let changed = false;
      const next = { ...current };
      for (const id of keys) {
        const todayTask = todayTaskByHabitId.get(id);
        const serverChecked = todayTask?.status === "completed";
        if (next[id] === serverChecked) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [todayTaskByHabitId]);

  const habitTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const habit of items) map.set(habit.id, habit.title);
    return map;
  }, [items]);

  const instancesForHabit = useCallback(
    (habitId: string | null): HabitGridInstance[] => {
      return tasksQuery.rows.flatMap((task) => {
        if (!task.habit_id) return [];
        if (habitId && task.habit_id !== habitId) return [];
        const dueYmd = getTaskDueDateYmd(task.due_date);
        if (!dueYmd) return [];
        return [
          {
            dueYmd,
            status: task.status ?? "ready_to_start",
            taskId: task.id,
            title: habitTitleById.get(task.habit_id) ?? task.title ?? "Habit",
          },
        ];
      });
    },
    [habitTitleById, tasksQuery.rows],
  );

  const projects = useMemo(
    () =>
      projectsQuery.rows.map((project) => ({
        id: project.id,
        name: project.name ?? "Untitled",
        icon: project.icon,
        type: project.type,
      })),
    [projectsQuery.rows],
  );

  const reload = useCallback(
    async (opts?: { userPull?: boolean }) => {
      await Promise.all([
        habitsQuery.reload(opts),
        tasksQuery.reload(opts),
      ]);
    },
    [habitsQuery, tasksQuery],
  );

  const reloadSilent = useCallback(async () => {
    await reload(SILENT_RELOAD);
  }, [reload]);

  const onCreateHabit = useCallback(
    async (input: { title: string; icon: string | null }) => {
      await createHabit(client, {
        title: input.title,
        icon: input.icon,
      });
      await reloadSilent();
    },
    [client, reloadSilent],
  );

  const onUpdateHabit = useCallback(
    async (
      id: string,
      input: {
        title?: string;
        cadence?: HabitCadence;
        projectId?: string;
        icon?: string | null;
        description?: string | null;
        nextDueYmd?: string;
      },
    ) => {
      await updateHabit(client, id, input);
      await reloadSilent();
    },
    [client, reloadSilent],
  );

  const onRecordDay = useCallback(
    async (
      habitId: string,
      input: { dueYmd: string; status: "completed" | "canceled" },
    ) => {
      await recordHabitDay(client, habitId, input);
      await reloadSilent();
    },
    [client, reloadSilent],
  );

  const onToggleToday = useCallback(
    async (habit: HabitListItem, checked: boolean) => {
      setCheckedOverride((current) => ({ ...current, [habit.id]: checked }));
      try {
        await recordHabitDay(client, habit.id, {
          dueYmd: todayYmd,
          status: checked ? "completed" : "canceled",
        });
        await reloadSilent();
      } catch {
        setCheckedOverride((current) => {
          const next = { ...current };
          delete next[habit.id];
          return next;
        });
        throw new Error("Could not update habit day.");
      }
    },
    [client, reloadSilent, todayYmd],
  );

  const onDeleteDay = useCallback(
    async (taskId: string) => {
      await softDeleteTask(client, taskId);
      await reloadSilent();
    },
    [client, reloadSilent],
  );

  return {
    items,
    projects,
    todayYmd,
    loading: habitsQuery.loading,
    error: habitsQuery.error,
    pullRefreshing: habitsQuery.pullRefreshing,
    reload,
    instancesForHabit,
    onCreateHabit,
    onUpdateHabit,
    onRecordDay,
    onToggleToday,
    onDeleteDay,
  };
}

/** One data instance for list + detail so phone pushes stay warm. */
export function HabitsDataProvider({ children }: { children: ReactNode }) {
  const value = useHabitsDataState();
  return (
    <HabitsDataContext.Provider value={value}>
      {children}
    </HabitsDataContext.Provider>
  );
}

export function useHabitsData(): HabitsData {
  const value = useContext(HabitsDataContext);
  if (!value) {
    throw new Error("useHabitsData must be used within HabitsDataProvider");
  }
  return value;
}
