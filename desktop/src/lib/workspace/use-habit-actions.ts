import { useCallback, useRef } from "react";
import type { Habit as ApiHabit, Task as ApiTask } from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";

import { optimisticLocalMetadataCreate } from "./optimistic-local-metadata-create";
import { shouldSkipRestEntityWrite } from "./powersync-write-path";
import {
  applyHabitUpdatePatch,
  habitPatchToSqlite,
} from "./habit-sqlite-fields";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

/** Server creates today's habit task on insert — read it back after upload. */
async function seedHabitTodayTask(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  habitId: string,
  setApiHabits: ApiRowsSetter<ApiHabit>,
  setApiTasks: ApiRowsSetter<ApiTask>,
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>,
  knownTodayTaskId?: string | null,
): Promise<void> {
  let todayTaskId = knownTodayTaskId ?? null;

  if (!todayTaskId) {
    if (!powerSync.connected) return;
    try {
      await powerSync.flushCrudUpload();
    } catch (error) {
      console.warn(
        "[desktop] habit create upload deferred",
        error instanceof Error ? error.message : error,
      );
      return;
    }

    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      try {
        const row = await client.requestJson<ApiHabit>(
          `/api/v1/habits/${encodeURIComponent(habitId)}`,
        );
        if (row.todayTaskId) {
          todayTaskId = row.todayTaskId;
          setApiHabits((rows) => {
            if (!rows) return rows;
            return rows.map((entry) =>
              entry.id === habitId
                ? { ...entry, todayTaskId: row.todayTaskId }
                : entry,
            );
          });
          break;
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          // Upload not applied yet — retry.
        } else {
          console.warn("[desktop] habit today-task lookup failed", error);
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } else {
    setApiHabits((rows) => {
      if (!rows) return rows;
      return rows.map((entry) =>
        entry.id === habitId ? { ...entry, todayTaskId } : entry,
      );
    });
  }

  if (!todayTaskId) return;

  try {
    const task = await client.requestJson<ApiTask>(
      `/api/v1/tasks/${encodeURIComponent(todayTaskId)}`,
    );
    setApiTasks((rows) => {
      if (!rows) return [task];
      if (rows.some((entry) => entry.id === task.id)) return rows;
      return [task, ...rows];
    });
    if (powerSync.createMetadata) {
      try {
        await powerSync.createMetadata(
          "tasks",
          toSnakeFields({
            title: task.title,
            projectId: task.projectId,
            contactId: task.contactId,
            assigneeId: task.assigneeId,
            number: task.number,
            description: task.description,
            status: task.status,
            priority: task.priority,
            sortOrder: task.sortOrder,
            dueDate: task.dueDate,
            inbox: task.inbox,
            habitId: task.habitId,
            completedAt: task.completedAt,
          }),
          task.id,
        );
      } catch {
        // Download sync will eventually bring the row in.
      }
    }
  } catch (error) {
    console.warn("[desktop] habit today task seed failed", error);
  }
}

/** Habit CRUD plus per-day completion recording. */
export function useWorkspaceHabitActions({
  authenticated,
  client,
  powerSync,
  toSnakeFields,
  softRefreshApiTasks,
  rawHabits,
  setApiHabits,
  setApiTasks,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>;
  softRefreshApiTasks: () => Promise<void>;
  rawHabits: ApiHabit[];
  setApiHabits: ApiRowsSetter<ApiHabit>;
  setApiTasks: ApiRowsSetter<ApiTask>;
}) {
  const rawHabitsRef = useRef(rawHabits);
  rawHabitsRef.current = rawHabits;
  const reloadHabits = useCallback(async () => {
    if (!authenticated) return [];
    if (shouldSkipRestEntityWrite(powerSync)) {
      return rawHabitsRef.current;
    }
    const body = await client.requestJson<{ habits: ApiHabit[] }>(
      "/api/v1/habits",
    );
    const tasksBody = await client.requestJson<{ tasks: ApiTask[] }>(
      "/api/v1/tasks",
    );
    setApiHabits(body.habits);
    setApiTasks(tasksBody.tasks);
    return body.habits;
  }, [authenticated, client, powerSync, setApiHabits, setApiTasks]);

  const createHabit = useCallback(
    async (input: { title: string; icon?: string | null }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Habit title is required.");
      if (!authenticated) throw new Error("Sign in to create habits.");

      if (shouldSkipRestEntityWrite(powerSync) && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const habit = {
          id,
          title,
          icon: input.icon ?? null,
          cadence: "daily",
          sortOrder: Date.now(),
          createdAt: now,
          updatedAt: now,
        } as ApiHabit;
        await optimisticLocalMetadataCreate({
          id,
          applyOptimistic: () => {
            setApiHabits((rows) => {
              if (!rows) return [habit];
              if (rows.some((entry) => entry.id === habit.id)) return rows;
              return [habit, ...rows];
            });
          },
          rollback: () =>
            setApiHabits((rows) => rows?.filter((entry) => entry.id !== id) ?? null),
          createMetadata: () =>
            powerSync.createMetadata!(
              "habits",
              toSnakeFields({
                title: habit.title,
                icon: habit.icon,
                cadence: habit.cadence,
                sortOrder: habit.sortOrder,
              }),
              id,
            ),
          errorLabel: "local habit create",
          afterCreate: () =>
            seedHabitTodayTask(
              client,
              powerSync,
              id,
              setApiHabits,
              setApiTasks,
              toSnakeFields,
            ),
        });
        return habit;
      }

      const habit = await client.requestJson<ApiHabit>("/api/v1/habits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
        }),
      });
      setApiHabits((rows) => {
        if (!rows) return [habit];
        if (rows.some((entry) => entry.id === habit.id)) {
          return rows.map((entry) => (entry.id === habit.id ? habit : entry));
        }
        return [habit, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "habits",
            toSnakeFields({
              title: habit.title,
              icon: habit.icon,
              projectId: habit.projectId,
              cadence: habit.cadence,
              cadenceAnchorYmd: habit.cadenceAnchorYmd,
              sortOrder: habit.sortOrder,
            }),
            habit.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      if (habit.todayTaskId) {
        await seedHabitTodayTask(
          client,
          powerSync,
          habit.id,
          setApiHabits,
          setApiTasks,
          toSnakeFields,
          habit.todayTaskId,
        );
      }
      return habit;
    },
    [authenticated, client, powerSync, setApiHabits, setApiTasks, toSnakeFields],
  );

  const updateHabit = useCallback(
    async (
      id: string,
      input: {
        title?: string;
        cadence?: ApiHabit["cadence"];
        icon?: string | null;
        description?: string | null;
        projectId?: string;
        nextDueYmd?: string;
      },
    ) => {
      if (!authenticated) throw new Error("Sign in to update habits.");

      if (shouldSkipRestEntityWrite(powerSync) && powerSync.patchMetadata) {
        await powerSync.patchMetadata("habits", id, habitPatchToSqlite(input));
        const now = new Date().toISOString();
        const existing = rawHabits.find((entry) => entry.id === id);
        if (!existing) {
          throw new Error("Habit not found.");
        }
        const habit = applyHabitUpdatePatch(existing, input, now);
        setApiHabits((rows) => {
          if (!rows) return [habit];
          return rows.map((entry) => (entry.id === habit.id ? habit : entry));
        });
        if (input.nextDueYmd !== undefined) {
          await softRefreshApiTasks();
        }
        return habit;
      }

      const habit = await client.requestJson<ApiHabit>(
        `/api/v1/habits/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      setApiHabits((rows) => {
        if (!rows) return [habit];
        return rows.map((entry) => (entry.id === habit.id ? habit : entry));
      });
      if (powerSync.ready && powerSync.patchMetadata) {
        try {
          await powerSync.patchMetadata(
            "habits",
            habit.id,
            habitPatchToSqlite({
              title: habit.title,
              description: habit.description,
              cadence: habit.cadence,
              cadenceAnchorYmd: habit.cadenceAnchorYmd,
              icon: habit.icon,
              projectId: habit.projectId,
            }),
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      await reloadHabits();
      if (input.nextDueYmd !== undefined) {
        await softRefreshApiTasks();
      }
      return habit;
    },
    [
      authenticated,
      client,
      powerSync,
      rawHabits,
      reloadHabits,
      setApiHabits,
      softRefreshApiTasks,
      toSnakeFields,
    ],
  );

  const recordHabitDay = useCallback(
    async (
      habitId: string,
      input: { dueYmd: string; status: "completed" | "canceled" },
    ) => {
      if (!authenticated) throw new Error("Sign in to record habit days.");

      const habit = rawHabits.find((entry) => entry.id === habitId);
      if (
        shouldSkipRestEntityWrite(powerSync) &&
        powerSync.patchMetadata &&
        habit?.todayTaskId
      ) {
        const completedAt =
          input.status === "completed" ? new Date().toISOString() : null;
        const status = input.status === "completed" ? "completed" : "canceled";
        await powerSync.patchMetadata("tasks", habit.todayTaskId, {
          status,
          completed_at: completedAt,
          due_date: input.dueYmd,
          habit_id: habitId,
        });
        setApiTasks((rows) => {
          if (!rows) return rows;
          return rows.map((entry) =>
            entry.id === habit.todayTaskId
              ? ({
                  ...entry,
                  status,
                  completedAt,
                  dueDate: input.dueYmd,
                  habitId,
                  updatedAt: new Date().toISOString(),
                } as ApiTask)
              : entry,
          );
        });
        const existingTask =
          rawHabits.find((entry) => entry.id === habitId) ?? habit;
        return {
          id: habit.todayTaskId,
          title: existingTask.title,
          status,
          completedAt,
          dueDate: input.dueYmd,
          habitId,
        } as ApiTask;
      }

      const task = await client.requestJson<ApiTask>(
        `/api/v1/habits/${encodeURIComponent(habitId)}/days`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) {
          return rows.map((entry) => (entry.id === task.id ? task : entry));
        }
        return [task, ...rows];
      });
      if (powerSync.ready) {
        const fields = toSnakeFields({
          title: task.title,
          status: task.status,
          priority: task.priority,
          sortOrder: task.sortOrder,
          projectId: task.projectId,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          habitId: task.habitId,
          inbox: task.inbox,
          number: task.number,
          completedAt: task.completedAt,
        });
        try {
          if (powerSync.patchMetadata) {
            await powerSync.patchMetadata("tasks", task.id, {
              status: task.status,
              completed_at: task.completedAt,
              habit_id: task.habitId,
              due_date: task.dueDate,
            });
          }
        } catch {
          try {
            await powerSync.createMetadata?.("tasks", fields, task.id);
          } catch {
            // Download sync will eventually bring the row in.
          }
        }
      }
      await reloadHabits();
      return task;
    },
    [
      authenticated,
      client,
      powerSync,
      rawHabits,
      reloadHabits,
      setApiTasks,
      toSnakeFields,
    ],
  );

  return { reloadHabits, createHabit, updateHabit, recordHabitDay };
}
