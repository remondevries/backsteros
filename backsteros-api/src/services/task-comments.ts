import { and, asc, eq, isNull } from "drizzle-orm";

import type {
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { taskComments, tasks, users } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export function authorDisplayName(email: string | null | undefined): string {
  if (!email?.trim()) return "Someone";
  const local = email.trim().split("@")[0]?.trim();
  if (!local) return email.trim();
  return local;
}

/** Activity feed attribution: known user → name; otherwise treat as agent. */
export function activityActorName(input: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  userDisplayName?: string | null;
}): string {
  const named =
    input.actorName?.trim() ||
    input.userDisplayName?.trim() ||
    null;
  if (named) return named;
  if (input.actorEmail?.trim()) return authorDisplayName(input.actorEmail);
  if (input.actorUserId) return "User";
  return "Agent";
}

export async function listTaskComments(
  workspaceId: string,
  taskId: string,
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

  return executor
    .select()
    .from(taskComments)
    .where(
      and(
        eq(taskComments.taskId, taskId),
        eq(taskComments.workspaceId, workspaceId),
        isNull(taskComments.deletedAt),
      ),
    )
    .orderBy(asc(taskComments.createdAt));
}

export async function createTaskComment(
  workspaceId: string,
  taskId: string,
  input: CreateTaskCommentInput,
  author: { userId: string | null },
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

  let authorEmail: string | null = null;
  if (author.userId) {
    const [user] = await executor
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, author.userId))
      .limit(1);
    authorEmail = user?.email ?? null;
  }

  const [row] = await executor
    .insert(taskComments)
    .values({
      id: newId(),
      workspaceId,
      taskId,
      authorUserId: author.userId,
      authorEmail,
      body: input.body.trim(),
    })
    .returning();

  return row ?? null;
}

export async function updateTaskComment(
  workspaceId: string,
  taskId: string,
  commentId: string,
  input: UpdateTaskCommentInput,
  executor: DbExecutor = db,
) {
  const [existing] = await executor
    .select()
    .from(taskComments)
    .where(
      and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
        eq(taskComments.workspaceId, workspaceId),
        isNull(taskComments.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return null;

  const [row] = await executor
    .update(taskComments)
    .set({
      body: input.body.trim(),
      updatedAt: new Date(),
    })
    .where(eq(taskComments.id, commentId))
    .returning();

  return row ?? null;
}

export async function deleteTaskComment(
  workspaceId: string,
  taskId: string,
  commentId: string,
  executor: DbExecutor = db,
) {
  const [existing] = await executor
    .select({ id: taskComments.id })
    .from(taskComments)
    .where(
      and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
        eq(taskComments.workspaceId, workspaceId),
        isNull(taskComments.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return false;

  await executor
    .update(taskComments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(taskComments.id, commentId));

  return true;
}
