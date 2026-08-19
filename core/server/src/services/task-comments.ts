import { and, asc, eq, isNull, or } from "drizzle-orm";

import type {
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { contacts, taskComments, tasks, users } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import type { TaskWriteActor } from "../lib/write-actor.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type TaskCommentListRow = typeof taskComments.$inferSelect & {
  userDisplayName: string | null;
  userEmail: string | null;
  contactName: string | null;
  contactEmail: string | null;
};

export function authorDisplayName(email: string | null | undefined): string {
  if (!email?.trim()) return "Someone";
  const local = email.trim().split("@")[0]?.trim();
  if (!local) return email.trim();
  return local;
}

/** Activity/comment attribution: known user/contact → name; otherwise treat as agent. */
export function activityActorName(input: {
  actorUserId?: string | null;
  actorContactId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  userDisplayName?: string | null;
  contactName?: string | null;
}): string {
  const named =
    input.actorName?.trim() ||
    input.contactName?.trim() ||
    input.userDisplayName?.trim() ||
    null;
  if (named) return named;
  if (input.actorEmail?.trim()) return authorDisplayName(input.actorEmail);
  if (input.actorUserId || input.actorContactId) return "User";
  return "Agent";
}

export async function resolveWriteActorProfile(
  workspaceId: string,
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor,
): Promise<{
  userId: string | null;
  contactId: string | null;
  email: string | null;
  name: string | null;
}> {
  if (!actor || actor.kind === "agent") {
    return {
      userId: null,
      contactId: null,
      email: null,
      name: actor?.kind === "agent" ? "Agent" : null,
    };
  }

  if (actor.kind === "contact" || actor.contactId) {
    const contactId = actor.contactId ?? null;
    if (!contactId) {
      return { userId: null, contactId: null, email: null, name: "Agent" };
    }
    const [contact] = await executor
      .select({
        name: contacts.name,
        email: contacts.email,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (!contact) {
      return { userId: null, contactId: null, email: null, name: "Agent" };
    }
    return {
      userId: null,
      contactId,
      email: contact.email?.trim() || null,
      name: contact.name.trim() || "Agent",
    };
  }

  if (!actor.userId) {
    return { userId: null, contactId: null, email: null, name: null };
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
    user?.displayName?.trim() || (email ? authorDisplayName(email) : null);
  return { userId: actor.userId, contactId: null, email, name };
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
      authorContactId: taskComments.authorContactId,
      authorEmail: taskComments.authorEmail,
      body: taskComments.body,
      resolvedAt: taskComments.resolvedAt,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      deletedAt: taskComments.deletedAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
      contactName: contacts.name,
      contactEmail: contacts.email,
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.authorUserId, users.id))
    .leftJoin(contacts, eq(taskComments.authorContactId, contacts.id))
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
  author: TaskWriteActor,
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

  const profile = await resolveWriteActorProfile(workspaceId, author, executor);

  const [row] = await executor
    .insert(taskComments)
    .values({
      id: newId(),
      workspaceId,
      taskId,
      parentCommentId,
      authorUserId: profile.userId,
      authorContactId: profile.contactId,
      authorEmail: profile.email,
      body: input.body.trim(),
    })
    .returning();

  if (!row) return null;

  return {
    ...row,
    userDisplayName: profile.userId ? profile.name : null,
    userEmail: profile.userId ? profile.email : null,
    contactName: profile.contactId ? profile.name : null,
    contactEmail: profile.contactId ? profile.email : null,
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

  const profile = await resolveWriteActorProfile(
    workspaceId,
    {
      userId: row.authorUserId,
      contactId: row.authorContactId,
      kind: row.authorContactId
        ? "contact"
        : row.authorUserId
          ? "user"
          : "agent",
    },
    executor,
  );
  return {
    ...row,
    userDisplayName: profile.userId ? profile.name : null,
    userEmail: profile.userId ? profile.email : row.authorEmail,
    contactName: profile.contactId ? profile.name : null,
    contactEmail: profile.contactId ? profile.email : null,
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
