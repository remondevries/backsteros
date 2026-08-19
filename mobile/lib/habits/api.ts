import type {
  CreateHabitInput,
  Habit,
  RecordHabitDayInput,
  Task,
  UpdateHabitInput,
} from "@backsteros/contracts";

import type { createApiClient } from "@backsteros/api-client";

type ApiClient = ReturnType<typeof createApiClient>;

export async function listHabits(client: ApiClient): Promise<Habit[]> {
  const response = await client.requestJson<{ habits: Habit[] }>(
    "/api/v1/habits",
  );
  return response.habits;
}

export async function createHabit(
  client: ApiClient,
  input: CreateHabitInput,
): Promise<Habit> {
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
): Promise<Habit> {
  return client.requestJson<Habit>(`/api/v1/habits/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function recordHabitDay(
  client: ApiClient,
  habitId: string,
  input: RecordHabitDayInput,
): Promise<Task> {
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
): Promise<void> {
  await client.requestJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}
