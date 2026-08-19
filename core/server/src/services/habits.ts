import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import type {
  CreateHabitInput,
  Habit,
  RecordHabitDayInput,
  Task,
  UpdateHabitInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { habits, tasks, type DbHabit, type DbTask } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  DEFAULT_HABIT_TIMEZONE,
  HABIT_TASK_PRIORITY,
  dueDateToYmd,
  duplicateHabitDayTaskIdsToRemove,
  formatYmdInTimeZone,
  habitNeedsTodayTask,
  isHealthProjectName,
  isOpenHabitTaskStatus,
  nextEvery2DaysDueYmd,
  nextHealthProjectKey,
  parseHabitCadence,
  shouldCancelStaleHabitTask,
  ymdStartOfDayIso,
} from "../lib/habit-calendar.js";
import { toIso } from "../lib/mappers.js";
import * as circleService from "./circle-domain.js";
import * as taskProjectService from "./tasks-projects.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function asSettingsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function workspaceTimezone(settings: Record<string, unknown>): string {
  const timezone =
    typeof settings.timezone === "string" ? settings.timezone.trim() : "";
  if (!timezone) return DEFAULT_HABIT_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_HABIT_TIMEZONE;
  }
}

function defaultAssigneeId(settings: Record<string, unknown>): string | null {
  const value = settings.defaultAssigneeId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function toHabit(
  row: DbHabit,
  todayTask?: Pick<DbTask, "id" | "status"> | null,
): Habit {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon ?? null,
    description: row.description ?? null,
    projectId: row.projectId ?? "",
    cadence: parseHabitCadence(row.cadence),
    cadenceAnchorYmd: row.cadenceAnchorYmd,
    sortOrder: row.sortOrder,
    todayTaskId: todayTask?.id ?? null,
    todayTaskStatus: (todayTask?.status as Task["status"]) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

async function resolveProjectForHabit(
  workspaceId: string,
  projectId: string | null | undefined,
  executor: DbExecutor,
) {
  if (projectId) {
    const project = await taskProjectService.getProjectById(
      workspaceId,
      projectId,
      executor,
    );
    if (project) return project;
  }
  return ensureHealthProject(workspaceId, executor);
}

/** Ensure the habit row has a usable projectId (backfill Health when missing). */
async function ensureHabitProjectId(
  workspaceId: string,
  habit: DbHabit,
  executor: DbExecutor,
): Promise<DbHabit> {
  if (habit.projectId) {
    const project = await taskProjectService.getProjectById(
      workspaceId,
      habit.projectId,
      executor,
    );
    if (project) return habit;
  }
  const project = await ensureHealthProject(workspaceId, executor);
  const [updated] = await executor
    .update(habits)
    .set({ projectId: project.id, updatedAt: new Date() })
    .where(and(eq(habits.workspaceId, workspaceId), eq(habits.id, habit.id)))
    .returning();
  return updated ?? { ...habit, projectId: project.id };
}

export async function ensureHealthProject(
  workspaceId: string,
  executor: DbExecutor = db,
) {
  const projects = await taskProjectService.listProjects(
    workspaceId,
    {},
    executor,
  );
  const existing = projects.find((project) => isHealthProjectName(project.name));
  if (existing) return existing;

  const usedKeys = projects.map((project) => project.key);
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const key = nextHealthProjectKey(usedKeys);
    try {
      return await taskProjectService.createProject(
        workspaceId,
        {
          key,
          name: "Health",
          type: "general",
          status: "active",
        },
        newId(),
        executor,
      );
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.message !== "PROJECT_KEY_EXISTS") {
        throw error;
      }
      usedKeys.push(key);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("PROJECT_KEY_EXISTS");
}

async function listHabitRows(workspaceId: string, executor: DbExecutor) {
  return executor
    .select()
    .from(habits)
    .where(and(eq(habits.workspaceId, workspaceId), isNull(habits.deletedAt)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt));
}

async function listHabitTaskRows(workspaceId: string, executor: DbExecutor) {
  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNotNull(tasks.habitId),
        isNull(tasks.deletedAt),
      ),
    );
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code: unknown }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return false;
}

async function createHabitTask(
  workspaceId: string,
  habit: Pick<DbHabit, "id" | "title">,
  projectId: string,
  dueYmd: string,
  timeZone: string,
  assigneeId: string | null,
  executor: DbExecutor,
  status: "ready_to_start" | "completed" | "canceled" = "ready_to_start",
) {
  const input = {
    title: habit.title,
    projectId,
    habitId: habit.id,
    status,
    priority: HABIT_TASK_PRIORITY,
    assigneeId,
    dueDate: ymdStartOfDayIso(dueYmd, timeZone),
    inbox: false,
    sortOrder: Date.now(),
  };
  try {
    return await taskProjectService.createTask(
      workspaceId,
      input,
      newId(),
      executor,
    );
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    if (
      assigneeId &&
      error instanceof Error &&
      error.message === "ASSIGNEE_NOT_FOUND"
    ) {
      try {
        return await taskProjectService.createTask(
          workspaceId,
          { ...input, assigneeId: null },
          newId(),
          executor,
        );
      } catch (retryError) {
        if (isUniqueViolation(retryError)) return null;
        throw retryError;
      }
    }
    throw error;
  }
}

async function collapseDuplicateHabitDays(
  workspaceId: string,
  taskRows: DbTask[],
  timeZone: string,
  executor: DbExecutor,
) {
  const groups = new Map<string, DbTask[]>();
  for (const task of taskRows) {
    if (task.deletedAt || !task.habitId) continue;
    const dueYmd = dueDateToYmd(task.dueDate, timeZone);
    if (!dueYmd) continue;
    const key = `${task.habitId}:${dueYmd}`;
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const extraIds = new Set(duplicateHabitDayTaskIdsToRemove(group));
    if (extraIds.size === 0) continue;
    for (const task of group) {
      if (!extraIds.has(task.id)) continue;
      await taskProjectService.deleteTask(workspaceId, task.id, executor);
      task.deletedAt = new Date();
    }
  }
}

export async function ensureHabitTasksForDate(
  workspaceId: string,
  todayYmd?: string,
  executor: DbExecutor = db,
) {
  const settings = asSettingsRecord(
    await circleService.getSettings(workspaceId, executor),
  );
  const timeZone = workspaceTimezone(settings);
  const resolvedToday = todayYmd ?? formatYmdInTimeZone(new Date(), timeZone);
  const assigneeId = defaultAssigneeId(settings);
  const habitRows = await listHabitRows(workspaceId, executor);
  const taskRows = await listHabitTaskRows(workspaceId, executor);
  if (habitRows.length === 0) {
    return { timeZone, todayYmd: resolvedToday, habits: habitRows, tasks: taskRows };
  }

  const resolvedHabits: DbHabit[] = [];
  for (const habit of habitRows) {
    resolvedHabits.push(await ensureHabitProjectId(workspaceId, habit, executor));
  }

  for (const task of taskRows) {
    const dueYmd = dueDateToYmd(task.dueDate, timeZone);
    if (!shouldCancelStaleHabitTask(task.status, dueYmd, resolvedToday)) {
      continue;
    }
    await taskProjectService.updateTask(
      workspaceId,
      task.id,
      { status: "canceled" },
      executor,
    );
    task.status = "canceled";
  }

  await collapseDuplicateHabitDays(
    workspaceId,
    taskRows,
    timeZone,
    executor,
  );

  const dueYmdsByHabit = new Map<string, string[]>();
  const outcomesByHabit = new Map<
    string,
    { dueYmd: string; status: string }[]
  >();
  for (const task of taskRows) {
    if (!task.habitId || task.deletedAt) continue;
    const dueYmd = dueDateToYmd(task.dueDate, timeZone);
    if (!dueYmd) continue;
    const existing = dueYmdsByHabit.get(task.habitId) ?? [];
    existing.push(dueYmd);
    dueYmdsByHabit.set(task.habitId, existing);
    const outcomes = outcomesByHabit.get(task.habitId) ?? [];
    outcomes.push({ dueYmd, status: task.status });
    outcomesByHabit.set(task.habitId, outcomes);
  }

  for (const habit of resolvedHabits) {
    if (
      !habitNeedsTodayTask(
        dueYmdsByHabit.get(habit.id) ?? [],
        resolvedToday,
        parseHabitCadence(habit.cadence),
        habit.cadenceAnchorYmd,
        outcomesByHabit.get(habit.id) ?? [],
      )
    ) {
      continue;
    }
    const project = await resolveProjectForHabit(
      workspaceId,
      habit.projectId,
      executor,
    );
    const created = await createHabitTask(
      workspaceId,
      habit,
      project.id,
      resolvedToday,
      timeZone,
      assigneeId,
      executor,
    );
    if (created) {
      taskRows.push(created);
      continue;
    }
  }

  return {
    timeZone,
    todayYmd: resolvedToday,
    habits: resolvedHabits,
    tasks: taskRows,
  };
}

function todayTaskForHabit(
  habitId: string,
  taskRows: DbTask[],
  todayYmd: string,
  timeZone: string,
): DbTask | null {
  return (
    taskRows.find(
      (task) =>
        !task.deletedAt &&
        task.habitId === habitId &&
        dueDateToYmd(task.dueDate, timeZone) === todayYmd,
    ) ?? null
  );
}

export async function listHabits(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<Habit[]> {
  const ensured = await ensureHabitTasksForDate(workspaceId, undefined, executor);
  return ensured.habits.map((habit) =>
    toHabit(
      habit,
      todayTaskForHabit(habit.id, ensured.tasks, ensured.todayYmd, ensured.timeZone),
    ),
  );
}

export async function getHabitById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<Habit | null> {
  const [row] = await executor
    .select()
    .from(habits)
    .where(
      and(
        eq(habits.workspaceId, workspaceId),
        eq(habits.id, id),
        isNull(habits.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const ensured = await ensureHabitTasksForDate(workspaceId, undefined, executor);
  const habit =
    ensured.habits.find((entry) => entry.id === id) ??
    (await ensureHabitProjectId(workspaceId, row, executor));
  return toHabit(
    habit,
    todayTaskForHabit(id, ensured.tasks, ensured.todayYmd, ensured.timeZone),
  );
}

export async function getHabitRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(habits)
    .where(and(eq(habits.workspaceId, workspaceId), eq(habits.id, id)))
    .limit(1);
  return row ?? null;
}

export async function updateHabitRow(
  workspaceId: string,
  id: string,
  input: {
    title?: string;
    icon?: string | null;
    description?: string | null;
    sortOrder?: number;
    cadence?: string;
    cadenceAnchorYmd?: string;
    projectId?: string;
  },
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(habits)
    .set({
      title: input.title,
      icon: input.icon,
      description: input.description,
      sortOrder: input.sortOrder,
      cadence: input.cadence,
      cadenceAnchorYmd: input.cadenceAnchorYmd,
      projectId: input.projectId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(habits.workspaceId, workspaceId),
        eq(habits.id, id),
        isNull(habits.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteHabitRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(habits)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(habits.workspaceId, workspaceId),
        eq(habits.id, id),
        isNull(habits.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function createHabitRow(
  workspaceId: string,
  input: CreateHabitInput,
  id = newId(),
  executor: DbExecutor = db,
  cadenceAnchorYmd?: string,
  projectId?: string,
) {
  const [row] = await executor
    .insert(habits)
    .values({
      id,
      workspaceId,
      title: input.title.trim(),
      icon: input.icon ?? null,
      projectId: projectId ?? null,
      cadence: parseHabitCadence(input.cadence),
      cadenceAnchorYmd:
        cadenceAnchorYmd ??
        formatYmdInTimeZone(new Date(), DEFAULT_HABIT_TIMEZONE),
      sortOrder: Date.now(),
    })
    .returning();
  return row!;
}

function nextOpenHabitTask(
  habitId: string,
  taskRows: DbTask[],
  timeZone: string,
): DbTask | null {
  const open = taskRows
    .filter(
      (task) =>
        task.habitId === habitId && isOpenHabitTaskStatus(task.status),
    )
    .map((task) => ({
      task,
      dueYmd: dueDateToYmd(task.dueDate, timeZone),
    }))
    .filter((entry): entry is { task: DbTask; dueYmd: string } =>
      Boolean(entry.dueYmd),
    )
    .sort((a, b) => a.dueYmd.localeCompare(b.dueYmd));
  return open[0]?.task ?? null;
}

function habitOutcomesFromTasks(
  habitId: string,
  taskRows: DbTask[],
  timeZone: string,
): { dueYmd: string; status: string }[] {
  return taskRows
    .filter((task) => task.habitId === habitId && !task.deletedAt)
    .map((task) => {
      const dueYmd = dueDateToYmd(task.dueDate, timeZone);
      return dueYmd ? { dueYmd, status: task.status } : null;
    })
    .filter((entry): entry is { dueYmd: string; status: string } =>
      Boolean(entry),
    );
}

/** Keep a single open every-2-days placeholder aligned with the latest completion. */
async function reconcileEvery2DaysOpenTask(
  workspaceId: string,
  habit: DbHabit,
  taskRows: DbTask[],
  timeZone: string,
  todayYmd: string,
  assigneeId: string | null,
  executor: DbExecutor,
): Promise<void> {
  if (parseHabitCadence(habit.cadence) !== "every_2_days") return;

  const anchor = habit.cadenceAnchorYmd ?? todayYmd;
  const outcomes = habitOutcomesFromTasks(habit.id, taskRows, timeZone);
  const nextDueYmd = nextEvery2DaysDueYmd(outcomes, anchor);

  const openWithDue = taskRows
    .filter(
      (task) =>
        task.habitId === habit.id &&
        !task.deletedAt &&
        isOpenHabitTaskStatus(task.status),
    )
    .map((task) => ({
      task,
      dueYmd: dueDateToYmd(task.dueDate, timeZone),
    }))
    .filter((entry): entry is { task: DbTask; dueYmd: string } =>
      Boolean(entry.dueYmd),
    );

  if (nextDueYmd <= todayYmd) {
    for (const { task, dueYmd } of openWithDue) {
      if (dueYmd <= todayYmd) continue;
      await taskProjectService.updateTask(
        workspaceId,
        task.id,
        { status: "canceled" },
        executor,
      );
    }
    return;
  }

  const atNextDue = openWithDue.find((entry) => entry.dueYmd === nextDueYmd);
  const futureOpen = openWithDue.filter((entry) => entry.dueYmd > todayYmd);

  if (atNextDue) {
    for (const { task, dueYmd } of futureOpen) {
      if (dueYmd === nextDueYmd) continue;
      await taskProjectService.updateTask(
        workspaceId,
        task.id,
        { status: "canceled" },
        executor,
      );
    }
    return;
  }

  const reusable = [...futureOpen].sort((a, b) =>
    a.dueYmd.localeCompare(b.dueYmd),
  )[0];
  if (reusable) {
    await taskProjectService.updateTask(
      workspaceId,
      reusable.task.id,
      { dueDate: ymdStartOfDayIso(nextDueYmd, timeZone) },
      executor,
    );
    for (const { task } of futureOpen) {
      if (task.id === reusable.task.id) continue;
      await taskProjectService.updateTask(
        workspaceId,
        task.id,
        { status: "canceled" },
        executor,
      );
    }
    return;
  }

  const project = await resolveProjectForHabit(
    workspaceId,
    habit.projectId,
    executor,
  );
  await createHabitTask(
    workspaceId,
    habit,
    project.id,
    nextDueYmd,
    timeZone,
    assigneeId,
    executor,
  );
}

export async function updateHabit(
  workspaceId: string,
  id: string,
  input: UpdateHabitInput,
  executor: DbExecutor = db,
): Promise<Habit | null> {
  const existing = await getHabitRow(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const settings = asSettingsRecord(
    await circleService.getSettings(workspaceId, executor),
  );
  const timeZone = workspaceTimezone(settings);
  const todayYmd = formatYmdInTimeZone(new Date(), timeZone);
  const nextCadence =
    input.cadence === undefined
      ? undefined
      : parseHabitCadence(input.cadence);

  let nextProjectId: string | undefined;
  if (input.projectId !== undefined) {
    const project = await taskProjectService.getProjectById(
      workspaceId,
      input.projectId,
      executor,
    );
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    nextProjectId = project.id;
  }

  const nextTitle =
    input.title === undefined ? undefined : input.title.trim();
  const titleToPersist =
    nextTitle === undefined
      ? undefined
      : nextTitle.length > 0
        ? nextTitle
        : existing.title;

  const nextDescription =
    input.description === undefined
      ? undefined
      : input.description === null
        ? null
        : input.description.trim() || null;

  const nextDueYmd = input.nextDueYmd;
  if (nextDueYmd !== undefined && nextDueYmd < todayYmd) {
    throw new Error("HABIT_NEXT_DUE_IN_PAST");
  }

  let nextAnchorYmd: string | undefined;
  if (nextCadence && nextCadence !== parseHabitCadence(existing.cadence)) {
    nextAnchorYmd = todayYmd;
  }
  if (nextDueYmd !== undefined) {
    nextAnchorYmd = nextDueYmd;
  }

  const row = await updateHabitRow(
    workspaceId,
    id,
    {
      title: titleToPersist === existing.title ? undefined : titleToPersist,
      icon: input.icon,
      description: nextDescription,
      cadence: nextCadence,
      cadenceAnchorYmd: nextAnchorYmd,
      projectId: nextProjectId,
    },
    executor,
  );
  if (!row) return null;

  const titleChanged =
    titleToPersist !== undefined &&
    titleToPersist !== existing.title;
  const renamedTitle = titleChanged ? titleToPersist : null;
  const projectChanged =
    nextProjectId !== undefined && nextProjectId !== existing.projectId;

  if (renamedTitle || projectChanged) {
    const taskRows = await listHabitTaskRows(workspaceId, executor);
    for (const task of taskRows) {
      if (task.habitId !== id) continue;

      if (renamedTitle && task.title !== renamedTitle) {
        // Keep every habit-day task titled like the habit so they stay linked.
        await taskProjectService.updateTask(
          workspaceId,
          task.id,
          { title: renamedTitle },
          executor,
        );
      }

      if (!projectChanged || task.projectId === nextProjectId) continue;
      // Keep open / today's instances aligned with the new project.
      if (
        task.status === "completed" ||
        task.status === "canceled" ||
        task.status === "duplicated"
      ) {
        continue;
      }
      await taskProjectService.updateTask(
        workspaceId,
        task.id,
        { projectId: nextProjectId },
        executor,
      );
    }
  }

  if (nextDueYmd !== undefined) {
    const taskRows = await listHabitTaskRows(workspaceId, executor);
    const occupying =
      taskRows.find(
        (task) =>
          task.habitId === id &&
          dueDateToYmd(task.dueDate, timeZone) === nextDueYmd,
      ) ?? null;
    const openTask = nextOpenHabitTask(id, taskRows, timeZone);

    if (occupying && (!openTask || occupying.id !== openTask.id)) {
      throw new Error("HABIT_DAY_EXISTS");
    }

    if (openTask) {
      const openDueYmd = dueDateToYmd(openTask.dueDate, timeZone);
      if (openDueYmd !== nextDueYmd) {
        await taskProjectService.updateTask(
          workspaceId,
          openTask.id,
          { dueDate: ymdStartOfDayIso(nextDueYmd, timeZone) },
          executor,
        );
      }
    } else if (!occupying) {
      const project = await resolveProjectForHabit(
        workspaceId,
        row.projectId ?? nextProjectId ?? existing.projectId,
        executor,
      );
      await createHabitTask(
        workspaceId,
        { id: row.id, title: row.title },
        project.id,
        nextDueYmd,
        timeZone,
        defaultAssigneeId(settings),
        executor,
      );
    }
  }

  const ensured = await ensureHabitTasksForDate(workspaceId, todayYmd, executor);
  return toHabit(
    row,
    todayTaskForHabit(id, ensured.tasks, ensured.todayYmd, ensured.timeZone),
  );
}

export async function createHabit(
  workspaceId: string,
  input: CreateHabitInput,
  id = newId(),
  executor: DbExecutor = db,
): Promise<Habit> {
  const settings = asSettingsRecord(
    await circleService.getSettings(workspaceId, executor),
  );
  const timeZone = workspaceTimezone(settings);
  const todayYmd = formatYmdInTimeZone(new Date(), timeZone);
  const project = await resolveProjectForHabit(
    workspaceId,
    input.projectId,
    executor,
  );
  const created = await createHabitRow(
    workspaceId,
    input,
    id,
    executor,
    todayYmd,
    project.id,
  );
  const todayTask = await createHabitTask(
    workspaceId,
    created,
    project.id,
    todayYmd,
    timeZone,
    defaultAssigneeId(settings),
    executor,
  );
  return toHabit(created, todayTask);
}

/**
 * Create or update the habit task for a calendar day as completed or skipped.
 * Only allows today or earlier (not future days).
 */
export async function recordHabitDay(
  workspaceId: string,
  habitId: string,
  input: RecordHabitDayInput,
  executor: DbExecutor = db,
): Promise<{ task: DbTask; created: boolean } | null> {
  const habitRow = await getHabitRow(workspaceId, habitId, executor);
  if (!habitRow || habitRow.deletedAt) return null;
  const habit = await ensureHabitProjectId(workspaceId, habitRow, executor);

  const settings = asSettingsRecord(
    await circleService.getSettings(workspaceId, executor),
  );
  const timeZone = workspaceTimezone(settings);
  const todayYmd = formatYmdInTimeZone(new Date(), timeZone);
  const assigneeId = defaultAssigneeId(settings);
  if (input.dueYmd > todayYmd) {
    throw new Error("HABIT_DAY_IN_FUTURE");
  }

  const taskRows = await listHabitTaskRows(workspaceId, executor);
  const existing =
    taskRows.find(
      (task) =>
        task.habitId === habitId &&
        dueDateToYmd(task.dueDate, timeZone) === input.dueYmd,
    ) ?? null;

  let result: { task: DbTask; created: boolean } | null = null;

  if (existing) {
    const updated = await taskProjectService.updateTask(
      workspaceId,
      existing.id,
      { status: input.status },
      executor,
    );
    if (!updated) return null;
    result = { task: updated, created: false };
  } else {
    const project = await resolveProjectForHabit(
      workspaceId,
      habit.projectId,
      executor,
    );
    const created = await createHabitTask(
      workspaceId,
      habit,
      project.id,
      input.dueYmd,
      timeZone,
      assigneeId,
      executor,
      input.status,
    );
    if (!created) {
      const match =
        (await listHabitTaskRows(workspaceId, executor)).find(
          (task) =>
            task.habitId === habitId &&
            dueDateToYmd(task.dueDate, timeZone) === input.dueYmd,
        ) ?? null;
      if (!match) return null;
      const updated = await taskProjectService.updateTask(
        workspaceId,
        match.id,
        { status: input.status },
        executor,
      );
      if (!updated) return null;
      result = { task: updated, created: false };
    } else {
      result = { task: created, created: true };
    }
  }

  if (
    result &&
    (input.status === "completed" || input.status === "canceled")
  ) {
    const refreshed = await listHabitTaskRows(workspaceId, executor);
    await reconcileEvery2DaysOpenTask(
      workspaceId,
      habit,
      refreshed,
      timeZone,
      todayYmd,
      assigneeId,
      executor,
    );
  }

  return result;
}
