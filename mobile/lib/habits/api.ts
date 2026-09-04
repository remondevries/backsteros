import type {
  CreateHabitInput,
  Habit,
  RecordHabitDayInput,
  Task,
  UpdateHabitInput,
} from "@backsteros/contracts";

import type { createApiClient } from "@backsteros/api-client";

import {
  softDeleteEntityViaPowerSyncOrApi,
  toSnakeFields,
  type MobileSoftDeletePowerSync,
} from "../entity-mutations";
import { getTodayJournalDateSlug } from "../journal";
import {
  shouldSkipRestEntityWrite,
  shouldWriteEntityViaPowerSync,
} from "../powersync-write-path";

type ApiClient = ReturnType<typeof createApiClient>;

export type MobileHabitPowerSync = {
  ready: boolean;
  connected: boolean;
  preferRestWrites?: boolean;
  patchHabit: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchMetadata?: (
    table: "tasks" | "habits",
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  createMetadata?: (
    table: "habits",
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
};

function habitApiPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "projectId") sqliteValues.project_id = value;
    else if (key === "cadenceAnchorYmd") sqliteValues.cadence_anchor_ymd = value;
    else if (key === "nextDueYmd") sqliteValues.cadence_anchor_ymd = value;
    else if (key === "sortOrder") sqliteValues.sort_order = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

function localHabitStub(
  id: string,
  fields: {
    title: string;
    icon?: string | null;
    description?: string | null;
    projectId?: string;
    cadence?: Habit["cadence"];
    cadenceAnchorYmd?: string;
    sortOrder?: number;
  },
): Habit {
  const now = new Date().toISOString();
  return {
    id,
    title: fields.title,
    icon: fields.icon ?? null,
    description: fields.description ?? null,
    projectId: fields.projectId ?? "",
    cadence: fields.cadence ?? "daily",
    cadenceAnchorYmd: fields.cadenceAnchorYmd ?? getTodayJournalDateSlug(),
    sortOrder: fields.sortOrder ?? Date.now(),
    todayTaskId: null,
    todayTaskStatus: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function listHabits(client: ApiClient): Promise<Habit[]> {
  const response = await client.requestJson<{ habits: Habit[] }>(
    "/api/v1/habits",
  );
  return response.habits;
}

export async function createHabit(
  client: ApiClient,
  input: CreateHabitInput,
  powerSync: MobileHabitPowerSync,
): Promise<Habit> {
  const title = input.title.trim();
  const icon = input.icon ?? null;

  if (shouldWriteEntityViaPowerSync(powerSync) && powerSync.createMetadata) {
    const id = await powerSync.createMetadata(
      "habits",
      toSnakeFields({
        title,
        icon,
        cadence: input.cadence ?? "daily",
        sortOrder: Date.now(),
        projectId: input.projectId ?? null,
      }),
    );
    return localHabitStub(id, { title, icon, cadence: input.cadence });
  }

  return client.requestJson<Habit>("/api/v1/habits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateHabit(
  client: ApiClient,
  id: string,
  input: UpdateHabitInput,
  powerSync: MobileHabitPowerSync,
): Promise<Habit> {
  const sqliteValues = habitApiPatchToSqlite(input);

  if (
    shouldWriteEntityViaPowerSync(powerSync) &&
    Object.keys(sqliteValues).length > 0
  ) {
    try {
      await powerSync.patchHabit(id, sqliteValues);
    } catch {
      if (shouldSkipRestEntityWrite(powerSync)) {
        throw new Error("Could not update habit locally.");
      }
    }
  }

  if (shouldSkipRestEntityWrite(powerSync)) {
    const title =
      typeof input.title === "string" ? input.title.trim() : "Untitled";
    return localHabitStub(id, {
      title,
      icon: input.icon,
      description: input.description,
      projectId: input.projectId,
      cadence: input.cadence,
      cadenceAnchorYmd: input.nextDueYmd,
    });
  }

  const habit = await client.requestJson<Habit>(
    `/api/v1/habits/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  if (
    shouldWriteEntityViaPowerSync(powerSync) &&
    Object.keys(sqliteValues).length > 0
  ) {
    try {
      await powerSync.patchHabit(id, sqliteValues);
    } catch {
      // Download sync will eventually bring the row in.
    }
  }

  return habit;
}

export async function recordHabitDay(
  client: ApiClient,
  habitId: string,
  input: RecordHabitDayInput,
  powerSync?: MobileHabitPowerSync & { todayTaskId?: string | null },
): Promise<Task> {
  const todayTaskId = powerSync?.todayTaskId;
  if (
    powerSync &&
    todayTaskId &&
    shouldSkipRestEntityWrite(powerSync) &&
    powerSync.patchMetadata
  ) {
    const completedAt =
      input.status === "completed" ? new Date().toISOString() : null;
    const status = input.status === "completed" ? "completed" : "canceled";
    await powerSync.patchMetadata("tasks", todayTaskId, {
      status,
      completed_at: completedAt,
      due_date: input.dueYmd,
      habit_id: habitId,
    });
    return {
      id: todayTaskId,
      title: "",
      status,
      completedAt,
      dueDate: input.dueYmd,
      habitId,
    } as Task;
  }

  return client.requestJson<Task>(
    `/api/v1/habits/${encodeURIComponent(habitId)}/days`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function softDeleteTask(
  client: ApiClient,
  taskId: string,
  powerSync: MobileSoftDeletePowerSync,
): Promise<void> {
  await softDeleteEntityViaPowerSyncOrApi(
    client,
    powerSync,
    "tasks",
    taskId,
  );
}
