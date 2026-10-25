import {
  buildHabitRestPayload,
  can,
  commitRestEntityWrite,
  commitRestEntityWriteBatch,
  createHabitSchema,
  emitBackfilledHabitSync,
  emitHabitTaskSyncChanges,
  forbidden,
  getAuth,
  habitService,
  isRestLeaderFirstWrite,
  newId,
  notFound,
  nudgePeerEntityLive,
  recordHabitDaySchema,
  recordHabitRestSyncEvent,
  taskProjectService,
  taskWithKey,
  updateHabitSchema,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Habits and habit days. */
export function registerHabitsRoutes(app: Hono) {
  app.get("/api/v1/habits", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const { habits, changedTasks, backfilledHabits } =
      await habitService.listHabits(auth.workspaceId);
    await emitHabitTaskSyncChanges(auth.workspaceId, changedTasks);
    await emitBackfilledHabitSync(auth.workspaceId, backfilledHabits);
    return c.json({ habits });
  });

  app.get("/api/v1/habits/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const result = await habitService.getHabitById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!result) return c.json(notFound("Habit"), 404);
    await emitHabitTaskSyncChanges(auth.workspaceId, result.changedTasks);
    await emitBackfilledHabitSync(auth.workspaceId, result.backfilledHabits);
    return c.json(result.habit);
  });

  app.post(
    "/api/v1/habits",
    zValidator("json", createHabitSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const habitId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "habit",
          entityId: habitId,
          operation: "upsert",
          payload: buildHabitRestPayload(habitId, body),
        });
        const result = await habitService.getHabitById(
          auth.workspaceId,
          habitId,
        );
        if (!result) {
          return c.json({ error: "Habit create failed", code: "internal" }, 500);
        }
        await emitHabitTaskSyncChanges(auth.workspaceId, result.changedTasks);
        nudgePeerEntityLive(auth, "habit", result.habit.id, "upsert");
        return c.json(result.habit, 201);
      }
      const created = await habitService.createHabit(
        auth.workspaceId,
        body,
      );
      const dbRow = await habitService.getHabitRow(auth.workspaceId, created.habit.id);
      if (dbRow) {
        await recordHabitRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      await emitHabitTaskSyncChanges(auth.workspaceId, created.changedTasks);
      nudgePeerEntityLive(auth, "habit", created.habit.id, "upsert");
      return c.json(created.habit, 201);
    },
  );

  app.patch(
    "/api/v1/habits/:id",
    zValidator("json", updateHabitSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const habitId = c.req.param("id");
      const patch = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const existing = await habitService.getHabitById(
            auth.workspaceId,
            habitId,
          );
          if (!existing) return c.json(notFound("Habit"), 404);
          await emitHabitTaskSyncChanges(
            auth.workspaceId,
            existing.changedTasks,
          );
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "habit",
            entityId: habitId,
            operation: "upsert",
            payload: buildHabitRestPayload(habitId, patch),
          });
          const result = await habitService.getHabitById(
            auth.workspaceId,
            habitId,
          );
          if (!result) return c.json(notFound("Habit"), 404);
          await emitHabitTaskSyncChanges(
            auth.workspaceId,
            result.changedTasks,
          );
          nudgePeerEntityLive(auth, "habit", result.habit.id, "upsert");
          return c.json(result.habit);
        }
        const updated = await habitService.updateHabit(
          auth.workspaceId,
          habitId,
          patch,
        );
        if (!updated) return c.json(notFound("Habit"), 404);
        const dbRow = await habitService.getHabitRow(
          auth.workspaceId,
          updated.habit.id,
        );
        if (dbRow) {
          await recordHabitRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        await emitHabitTaskSyncChanges(auth.workspaceId, updated.changedTasks);
        nudgePeerEntityLive(auth, "habit", updated.habit.id, "upsert");
        return c.json(updated.habit);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        if (error instanceof Error && error.message === "HABIT_NEXT_DUE_IN_PAST") {
          return c.json(
            {
              error: {
                code: "HABIT_NEXT_DUE_IN_PAST",
                message: "Next due date must be today or in the future.",
              },
            },
            400,
          );
        }
        if (error instanceof Error && error.message === "HABIT_DAY_EXISTS") {
          return c.json(
            {
              error: {
                code: "HABIT_DAY_EXISTS",
                message: "A habit day already exists for that date.",
              },
            },
            409,
          );
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/v1/habits/:id/days",
    zValidator("json", recordHabitDaySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const habitId = c.req.param("id");
        const input = c.req.valid("json");

        if (isRestLeaderFirstWrite()) {
          const existing = await habitService.findHabitTaskForDueYmd(
            auth.workspaceId,
            habitId,
            input.dueYmd,
          );
          const taskId = existing?.id ?? newId();
          const payload = await habitService.buildHabitDayTaskSyncPayload(
            auth.workspaceId,
            habitId,
            input,
            taskId,
            existing,
          );
          if (!payload) return c.json(notFound("Habit"), 404);
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task",
            entityId: taskId,
            operation: "upsert",
            payload,
          });
          const reconcileChanges =
            await habitService.planHabitDayReconcileLeaderChanges(
              auth.workspaceId,
              habitId,
              input,
            );
          if (reconcileChanges.length > 0) {
            await commitRestEntityWriteBatch({
              workspaceId: auth.workspaceId,
              changes: reconcileChanges.map((change) => ({
                entity: "task" as const,
                entityId: change.entityId,
                operation: change.operation,
                payload: change.payload,
              })),
            });
          }
          const task = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!task) {
            return c.json(
              { error: "Habit day write failed", code: "internal" },
              500,
            );
          }
          return c.json(await taskWithKey(auth.workspaceId, task), existing ? 200 : 201);
        }

        const result = await habitService.recordHabitDay(
          auth.workspaceId,
          habitId,
          input,
        );
        if (!result) return c.json(notFound("Habit"), 404);
        await emitHabitTaskSyncChanges(auth.workspaceId, result.changedTasks);
        return c.json(await taskWithKey(auth.workspaceId, result.task), result.created ? 201 : 200);
      } catch (error) {
        if (error instanceof Error && error.message === "HABIT_DAY_IN_FUTURE") {
          return c.json(
            { error: "Cannot record a future habit day", code: "bad_request" },
            400,
          );
        }
        throw error;
      }
    },
  );
}
