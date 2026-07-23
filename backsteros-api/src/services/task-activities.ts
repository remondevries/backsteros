import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { taskActivities, tasks, users } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { activityActorName, authorDisplayName } from "./task-comments.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type TaskActivityType =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "priority_changed"
  | "due_date_changed"
  | "project_changed"
  | "agent_worked";

/** Property updates coalesce into one row when repeated quickly. */
const COALESCEABLE_ACTIVITY_TYPES = new Set<TaskActivityType>([
  "status_changed",
  "assignee_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
]);

/** Rapid edits of the same property within this window update the prior row. */
export const ACTIVITY_COALESCE_WINDOW_MS = 30_000;

export type TaskWriteActor = {
  userId: string | null;
  /** When `agent`, activity is attributed to Agent even if a user is authenticated. */
  kind?: "user" | "agent";
};

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
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor,
): Promise<{
  userId: string | null;
  email: string | null;
  name: string | null;
}> {
  if (!actor || actor.kind === "agent" || !actor.userId) {
    return {
      userId: null,
      email: null,
      name: actor?.kind === "agent" ? "Agent" : null,
    };
  }
  const [user] = await executor
    .select({
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  const email = user?.email ?? null;
  const name =
    user?.displayName?.trim() ||
    (email ? authorDisplayName(email) : null);
  return { userId: actor.userId, email, name };
}

export async function recordTaskActivity(
  workspaceId: string,
  taskId: string,
  type: TaskActivityType,
  data: Record<string, unknown>,
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor = db,
) {
  const resolved = await resolveActorProfile(actor, executor);

  if (COALESCEABLE_ACTIVITY_TYPES.has(type)) {
    const since = new Date(Date.now() - ACTIVITY_COALESCE_WINDOW_MS);
    const actorMatch = resolved.userId
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
      id: newId(),
      workspaceId,
      taskId,
      type,
      actorUserId: resolved.userId,
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
  type: Extract<TaskActivityType, "agent_worked">,
  data: Record<string, unknown>,
  executor: DbExecutor = db,
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
    { userId: null, kind: "agent" },
    executor,
  );
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

export { activityActorName, authorDisplayName };
