import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { taskActivities, tasks, users } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import type { TaskWriteActor } from "../lib/write-actor.js";
import { resolveWriteActorProfile } from "./task-comments.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type TaskActivityType =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "related_contacts_changed"
  | "related_organizations_changed"
  | "priority_changed"
  | "due_date_changed"
  | "project_changed"
  | "agent_worked"
  | "timer_started"
  | "timer_stopped";

/** Property updates coalesce into one row when repeated quickly. */
const COALESCEABLE_ACTIVITY_TYPES = new Set<TaskActivityType>([
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
]);

/** Rapid edits of the same property within this window update the prior row. */
export const ACTIVITY_COALESCE_WINDOW_MS = 30_000;

export type { TaskWriteActor } from "../lib/write-actor.js";

export type TaskActivityListRow = typeof taskActivities.$inferSelect & {
  userDisplayName: string | null;
  userEmail: string | null;
};

function asDataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function activityValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  return false;
}

async function resolveActorProfile(
  workspaceId: string,
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor,
) {
  return resolveWriteActorProfile(workspaceId, actor, executor);
}

export async function recordTaskActivity(
  workspaceId: string,
  taskId: string,
  type: TaskActivityType,
  data: Record<string, unknown>,
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor = db,
  id?: string,
) {
  const resolved = await resolveActorProfile(workspaceId, actor, executor);

  if (COALESCEABLE_ACTIVITY_TYPES.has(type)) {
    const since = new Date(Date.now() - ACTIVITY_COALESCE_WINDOW_MS);
    const actorMatch = resolved.contactId
      ? eq(taskActivities.actorContactId, resolved.contactId)
      : resolved.userId
        ? eq(taskActivities.actorUserId, resolved.userId)
        : isNull(taskActivities.actorUserId);
    const [recent] = await executor
      .select()
      .from(taskActivities)
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.taskId, taskId),
          eq(taskActivities.type, type),
          actorMatch,
          gte(taskActivities.createdAt, since),
        ),
      )
      .orderBy(desc(taskActivities.createdAt))
      .limit(1);

    if (recent) {
      const previous = asDataRecord(recent.data);
      const merged: Record<string, unknown> = {
        ...data,
        from: Object.prototype.hasOwnProperty.call(previous, "from")
          ? previous.from
          : data.from,
        to: data.to,
      };
      if (Object.prototype.hasOwnProperty.call(previous, "fromName")) {
        merged.fromName = previous.fromName;
      }
      if (Object.prototype.hasOwnProperty.call(data, "toName")) {
        merged.toName = data.toName;
      }

      // Edit then revert within the window — drop the noise entirely.
      if (activityValuesEqual(merged.from, merged.to)) {
        await (executor as unknown as Pick<typeof db, "delete">)
          .delete(taskActivities)
          .where(eq(taskActivities.id, recent.id));
        return null;
      }

      const [updated] = await executor
        .update(taskActivities)
        .set({
          data: merged,
          actorEmail: resolved.email ?? recent.actorEmail,
          actorName: resolved.name ?? recent.actorName,
          actorContactId: resolved.contactId ?? recent.actorContactId,
          createdAt: new Date(),
        })
        .where(eq(taskActivities.id, recent.id))
        .returning();
      return updated ?? null;
    }
  }

  const [row] = await executor
    .insert(taskActivities)
    .values({
      id: id ?? newId(),
      workspaceId,
      taskId,
      type,
      actorUserId: resolved.userId,
      actorContactId: resolved.contactId,
      actorEmail: resolved.email,
      actorName: resolved.name,
      data,
    })
    .returning();
  return row ?? null;
}

export async function createClientTaskActivity(
  workspaceId: string,
  taskId: string,
  type: Extract<
    TaskActivityType,
    "agent_worked" | "timer_started" | "timer_stopped"
  >,
  data: Record<string, unknown>,
  actor: TaskWriteActor | null = { userId: null, kind: "agent" },
  executor: DbExecutor = db,
  id?: string,
) {
  const [task] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) return null;

  return recordTaskActivity(
    workspaceId,
    taskId,
    type,
    { ...data },
    actor,
    executor,
    id,
  );
}

export async function getTaskActivityRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof taskActivities.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listTaskActivities(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<TaskActivityListRow[] | null> {
  const [task] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) return null;

  const rows = await executor
    .select({
      id: taskActivities.id,
      workspaceId: taskActivities.workspaceId,
      taskId: taskActivities.taskId,
      type: taskActivities.type,
      actorUserId: taskActivities.actorUserId,
      actorContactId: taskActivities.actorContactId,
      actorEmail: taskActivities.actorEmail,
      actorName: taskActivities.actorName,
      data: taskActivities.data,
      createdAt: taskActivities.createdAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
    })
    .from(taskActivities)
    .leftJoin(users, eq(taskActivities.actorUserId, users.id))
    .where(
      and(
        eq(taskActivities.taskId, taskId),
        eq(taskActivities.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(taskActivities.createdAt));

  return rows;
}

export type OpenRunningTaskTimer = {
  taskId: string;
  startedAt: Date;
  title: string;
  number: number | null;
  status: string | null;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  projectKey: string | null;
};

/** Default window for “still running” — ignores abandoned starts without a stop. */
export const OPEN_RUNNING_TIMER_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * Tasks whose latest timer activity is `timer_started` (no later stop), within
 * `maxAgeMs`. Used by desktop chrome to mirror timers started in other clients.
 */
export async function listOpenRunningTaskTimers(
  workspaceId: string,
  maxAgeMs: number = OPEN_RUNNING_TIMER_MAX_AGE_MS,
): Promise<OpenRunningTaskTimer[]> {
  const since = new Date(Date.now() - Math.max(0, maxAgeMs));
  const sinceIso = since.toISOString();
  const rows = await db.execute<{
    taskId: string;
    startedAt: Date | string;
    title: string;
    number: number | null;
    status: string | null;
    trackedDurationSeconds: number | null;
    trackedMinutes: number | null;
    projectKey: string | null;
  }>(sql`
    SELECT
      a.task_id AS "taskId",
      a.created_at AS "startedAt",
      t.title AS title,
      t.number AS number,
      t.status AS status,
      t.tracked_duration_seconds AS "trackedDurationSeconds",
      t.tracked_minutes AS "trackedMinutes",
      p.key AS "projectKey"
    FROM task_activities a
    INNER JOIN tasks t
      ON t.id = a.task_id
      AND t.workspace_id = ${workspaceId}
      AND t.deleted_at IS NULL
    LEFT JOIN projects p
      ON p.id = t.project_id
      AND p.deleted_at IS NULL
    WHERE a.workspace_id = ${workspaceId}
      AND a.type = 'timer_started'
      AND a.created_at >= ${sinceIso}::timestamptz
      AND a.created_at = (
        SELECT MAX(c.created_at)
        FROM task_activities c
        WHERE c.task_id = a.task_id
          AND c.workspace_id = ${workspaceId}
          AND c.type IN ('timer_started', 'timer_stopped')
      )
    ORDER BY a.created_at DESC
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown }).rows;
  const entries = (Array.isArray(list) ? list : []) as Array<{
    taskId: string;
    startedAt: Date | string;
    title: string;
    number: number | null;
    status: string | null;
    trackedDurationSeconds: number | null;
    trackedMinutes: number | null;
    projectKey: string | null;
  }>;

  return entries.map((row) => ({
    taskId: row.taskId,
    startedAt:
      row.startedAt instanceof Date
        ? row.startedAt
        : new Date(String(row.startedAt)),
    title: row.title,
    number: row.number == null ? null : Number(row.number),
    status: row.status,
    trackedDurationSeconds:
      row.trackedDurationSeconds == null
        ? null
        : Number(row.trackedDurationSeconds),
    trackedMinutes:
      row.trackedMinutes == null ? null : Number(row.trackedMinutes),
    projectKey: row.projectKey,
  }));
}

export type DeletedTaskTimerSession = {
  taskId: string;
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
  removedDurationSeconds: number;
};

type TimerSessionPair = {
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
};

async function findTaskTimerSessionPair(
  workspaceId: string,
  taskId: string,
  activityId: string,
  executor: DbExecutor,
): Promise<TimerSessionPair | null> {
  const [target] = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.taskId, taskId),
        eq(taskActivities.id, activityId),
      ),
    )
    .limit(1);
  if (
    !target ||
    (target.type !== "timer_started" && target.type !== "timer_stopped")
  ) {
    return null;
  }

  const timerRows = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.taskId, taskId),
        inArray(taskActivities.type, ["timer_started", "timer_stopped"]),
      ),
    )
    .orderBy(asc(taskActivities.createdAt));

  const pairs: TimerSessionPair[] = [];
  let open: typeof taskActivities.$inferSelect | null = null;
  for (const row of timerRows) {
    if (row.type === "timer_started") {
      if (open) {
        pairs.push({ start: open, stop: null });
      }
      open = row;
      continue;
    }
    if (!open) continue;
    pairs.push({ start: open, stop: row });
    open = null;
  }
  if (open) {
    pairs.push({ start: open, stop: null });
  }

  return (
    pairs.find(
      (entry) =>
        entry.start.id === activityId || entry.stop?.id === activityId,
    ) ?? null
  );
}

/**
 * Delete a timer session identified by either its `timer_started` or
 * `timer_stopped` activity id. Removes the paired rows and subtracts the
 * recorded duration from the task’s tracked total.
 */
export async function deleteTaskTimerSession(
  workspaceId: string,
  taskId: string,
  activityId: string,
  executor: DbExecutor = db,
): Promise<DeletedTaskTimerSession | null> {
  const pair = await findTaskTimerSessionPair(
    workspaceId,
    taskId,
    activityId,
    executor,
  );
  if (!pair) return null;

  const durationFromStop =
    pair.stop?.data &&
    typeof pair.stop.data === "object" &&
    !Array.isArray(pair.stop.data) &&
    typeof (pair.stop.data as { durationSeconds?: unknown }).durationSeconds ===
      "number"
      ? Math.max(
          0,
          Math.round(
            (pair.stop.data as { durationSeconds: number }).durationSeconds,
          ),
        )
      : null;
  const startedMs = pair.start.createdAt.getTime();
  const stoppedMs = pair.stop?.createdAt.getTime() ?? null;
  const computed =
    pair.stop && Number.isFinite(startedMs) && stoppedMs != null
      ? Math.max(0, Math.round((stoppedMs - startedMs) / 1000))
      : 0;
  const removedDurationSeconds = durationFromStop ?? computed;

  const idsToDelete = [pair.start.id, pair.stop?.id].filter(
    (id): id is string => Boolean(id),
  );
  for (const id of idsToDelete) {
    await (executor as unknown as Pick<typeof db, "delete">)
      .delete(taskActivities)
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.id, id),
        ),
      );
  }

  if (removedDurationSeconds > 0) {
    const [task] = await executor
      .select({
        trackedDurationSeconds: tasks.trackedDurationSeconds,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (task) {
      const current = task.trackedDurationSeconds ?? 0;
      const next = Math.max(0, current - removedDurationSeconds);
      await executor
        .update(tasks)
        .set({
          trackedDurationSeconds: next > 0 ? next : null,
          trackedMinutes: next > 0 ? Math.round(next / 60) : null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)),
        );
    }
  }

  return {
    taskId,
    start: pair.start,
    stop: pair.stop,
    removedDurationSeconds,
  };
}

export type UpdatedTaskTimerSessionActor = {
  taskId: string;
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
};

/**
 * Reassign the contact shown on a timer session (both start and stop rows).
 */
export async function updateTaskTimerSessionActor(
  workspaceId: string,
  taskId: string,
  activityId: string,
  actorContactId: string,
  executor: DbExecutor = db,
): Promise<UpdatedTaskTimerSessionActor | null> {
  const pair = await findTaskTimerSessionPair(
    workspaceId,
    taskId,
    activityId,
    executor,
  );
  if (!pair) return null;

  const profile = await resolveWriteActorProfile(
    workspaceId,
    { userId: null, contactId: actorContactId, kind: "contact" },
    executor,
  );
  if (!profile.contactId) return null;

  const actorFields = {
    actorUserId: profile.userId,
    actorContactId: profile.contactId,
    actorEmail: profile.email,
    actorName: profile.name,
  };

  const [start] = await executor
    .update(taskActivities)
    .set(actorFields)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.id, pair.start.id),
      ),
    )
    .returning();
  if (!start) return null;

  let stop: typeof taskActivities.$inferSelect | null = null;
  if (pair.stop) {
    const [updatedStop] = await executor
      .update(taskActivities)
      .set(actorFields)
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.id, pair.stop.id),
        ),
      )
      .returning();
    stop = updatedStop ?? null;
  }

  return { taskId, start, stop };
}

export { activityActorName, authorDisplayName } from "./task-comments.js";
