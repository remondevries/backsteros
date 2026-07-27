import { and, asc, eq, isNull, or } from "drizzle-orm";

import type {
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { taskComments, tasks, users } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type TaskCommentListRow = typeof taskComments.$inferSelect & {
  userDisplayName: string | null;
  userEmail: string | null;
};

export function authorDisplayName(email: string | null | undefined): string {
  if (!email?.trim()) return "Someone";
  const local = email.trim().split("@")[0]?.trim();
  if (!local) return email.trim();
  return local;
}

/** Activity/comment attribution: known user → name; otherwise treat as agent. */
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

async function resolveAuthorProfile(
  userId: string | null,
  executor: DbExecutor,
): Promise<{ email: string | null; displayName: string | null }> {
  if (!userId) return { email: null, displayName: null };
  const [user] = await executor
    .select({
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    email: user?.email ?? null,
    displayName: user?.displayName?.trim() || null,
  };
}

export async function listTaskComments(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<TaskCommentListRow[] | null> {
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
    .select({
      id: taskComments.id,
      workspaceId: taskComments.workspaceId,
      taskId: taskComments.taskId,
      parentCommentId: taskComments.parentCommentId,
      authorUserId: taskComments.authorUserId,
      authorEmail: taskComments.authorEmail,
      body: taskComments.body,
      resolvedAt: taskComments.resolvedAt,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      deletedAt: taskComments.deletedAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.authorUserId, users.id))
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
  author: { userId: string | null; kind?: "user" | "agent" },
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

  const parentCommentId = input.parentCommentId?.trim() || null;
  if (parentCommentId) {
    const [parent] = await executor
      .select({
        id: taskComments.id,
        parentCommentId: taskComments.parentCommentId,
      })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.id, parentCommentId),
          eq(taskComments.taskId, taskId),
          eq(taskComments.workspaceId, workspaceId),
          isNull(taskComments.deletedAt),
        ),
      )
      .limit(1);
    // Only allow replies to top-level comments (one nesting level).
    if (!parent || parent.parentCommentId != null) return null;
  }

  const isAgent = author.kind === "agent";
  const authorUserId = isAgent ? null : author.userId;
  const profile = isAgent
    ? { email: null, displayName: null }
    : await resolveAuthorProfile(authorUserId, executor);

  const [row] = await executor
    .insert(taskComments)
    .values({
      id: newId(),
      workspaceId,
      taskId,
      parentCommentId,
      authorUserId,
      authorEmail: profile.email,
      body: input.body.trim(),
    })
    .returning();

  if (!row) return null;

  return {
    ...row,
    userDisplayName: isAgent ? "Agent" : profile.displayName,
    userEmail: profile.email,
  } satisfies TaskCommentListRow;
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

  const patch: {
    body?: string;
    resolvedAt?: Date | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.body !== undefined) {
    patch.body = input.body.trim();
  }

  if (input.resolvedAt !== undefined) {
    // Only root comments own a resolvable thread.
    if (existing.parentCommentId != null) return null;
    patch.resolvedAt =
      input.resolvedAt == null ? null : new Date(input.resolvedAt);
  }

  if (patch.body === undefined && input.resolvedAt === undefined) {
    return null;
  }

  const [row] = await executor
    .update(taskComments)
    .set(patch)
    .where(eq(taskComments.id, commentId))
    .returning();

  if (!row) return null;

  const profile = await resolveAuthorProfile(row.authorUserId, executor);
  return {
    ...row,
    userDisplayName: profile.displayName,
    userEmail: profile.email ?? row.authorEmail,
  } satisfies TaskCommentListRow;
}

export async function deleteTaskComment(
  workspaceId: string,
  taskId: string,
  commentId: string,
  executor: DbExecutor = db,
) {
  const [existing] = await executor
    .select({
      id: taskComments.id,
      parentCommentId: taskComments.parentCommentId,
    })
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

  const now = new Date();
  // Soft-delete the comment; if it's a root thread, also soft-delete replies.
  const match =
    existing.parentCommentId == null
      ? or(
          eq(taskComments.id, commentId),
          eq(taskComments.parentCommentId, commentId),
        )
      : eq(taskComments.id, commentId);

  await executor
    .update(taskComments)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(taskComments.taskId, taskId),
        eq(taskComments.workspaceId, workspaceId),
        isNull(taskComments.deletedAt),
        match,
      ),
    );

  return true;
}
