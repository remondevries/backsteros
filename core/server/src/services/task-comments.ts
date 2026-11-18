import { and, asc, desc, eq, isNull, or } from "drizzle-orm";

import type {
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { contacts, taskActivities, taskComments, tasks, users } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import type { TaskWriteActor } from "../lib/write-actor.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Keep the unified `task_activities` stream in sync with `task_comments`.
 * Same id so PowerSync / portal / desktop stay aligned during the cutover.
 */
function commentActivityData(input: {
  visibility?: string | null;
  authorSide?: string | null;
  emailMessageId?: string | null;
  emailDirection?: string | null;
  emailSender?: string | null;
  occurredAt?: Date | null;
  importedAt?: Date | null;
  importedByContactId?: string | null;
  importedByActor?: string | null;
}): Record<string, unknown> {
  return {
    visibility: input.visibility ?? "client_visible",
    authorSide: input.authorSide ?? null,
    emailMessageId: input.emailMessageId ?? null,
    emailDirection: input.emailDirection ?? null,
    emailSender: input.emailSender ?? null,
    occurredAt: input.occurredAt?.toISOString() ?? null,
    importedAt: input.importedAt?.toISOString() ?? null,
    importedByContactId: input.importedByContactId ?? null,
    importedByActor: input.importedByActor ?? null,
  };
}

async function upsertCommentActivity(
  workspaceId: string,
  input: {
    id: string;
    taskId: string;
    body: string;
    parentId: string | null;
    resolvedAt?: Date | null;
    actorUserId: string | null;
    actorContactId: string | null;
    actorEmail: string | null;
    actorName: string | null;
    deletedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    visibility?: string | null;
    authorSide?: string | null;
    emailMessageId?: string | null;
    emailDirection?: string | null;
    emailSender?: string | null;
    occurredAt?: Date | null;
    importedAt?: Date | null;
    importedByContactId?: string | null;
    importedByActor?: string | null;
  },
  executor: DbExecutor,
) {
  const now = input.updatedAt ?? new Date();
  const data = commentActivityData(input);
  const [existing] = await executor
    .select({ id: taskActivities.id })
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.id, input.id),
      ),
    )
    .limit(1);

  if (existing) {
    await executor
      .update(taskActivities)
      .set({
        type: "comment",
        taskId: input.taskId,
        actorUserId: input.actorUserId,
        actorContactId: input.actorContactId,
        actorEmail: input.actorEmail,
        actorName: input.actorName,
        body: input.body,
        parentId: input.parentId,
        resolvedAt: input.resolvedAt ?? null,
        deletedAt: input.deletedAt ?? null,
        updatedAt: now,
        data,
      })
      .where(eq(taskActivities.id, input.id));
    return;
  }

  await executor.insert(taskActivities).values({
    id: input.id,
    workspaceId,
    taskId: input.taskId,
    type: "comment",
    actorUserId: input.actorUserId,
    actorContactId: input.actorContactId,
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    data,
    body: input.body,
    parentId: input.parentId,
    resolvedAt: input.resolvedAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    deletedAt: input.deletedAt ?? null,
  });
}

async function softDeleteCommentActivities(
  workspaceId: string,
  taskId: string,
  ids: string[],
  now: Date,
  executor: DbExecutor,
) {
  if (ids.length === 0) return;
  for (const id of ids) {
    await executor
      .update(taskActivities)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.taskId, taskId),
          eq(taskActivities.id, id),
          eq(taskActivities.type, "comment"),
        ),
      );
  }
}

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
  const email = user?.email?.trim() || null;
  const name =
    user?.displayName?.trim() || (email ? authorDisplayName(email) : null);

  // Prefer the workspace contact that shares this user's email so avatars /
  // CRM attribution stay linked when the desktop posts as a user.
  let contactId: string | null = null;
  if (email) {
    const [matched] = await executor
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.email, email),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (matched) {
      contactId = matched.id;
      return {
        userId: actor.userId,
        contactId,
        email,
        name: matched.name.trim() || name,
      };
    }
  }

  return { userId: actor.userId, contactId, email, name };
}

export async function listTaskComments(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
  options?: {
    limit?: number;
    visibility?: "client_visible" | "internal" | "all";
  },
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

  const limit =
    typeof options?.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.min(Math.floor(options.limit), 200)
      : undefined;

  // Portal-safe default when callers omit visibility (OS-187).
  const visibility = options?.visibility ?? "client_visible";
  const visibilityFilter =
    visibility === "all"
      ? undefined
      : eq(taskComments.visibility, visibility);

  // Newest-first when limited (last N), then reverse to chronological by occurredAt.
  const baseQuery = executor
    .select({
      id: taskComments.id,
      workspaceId: taskComments.workspaceId,
      taskId: taskComments.taskId,
      parentCommentId: taskComments.parentCommentId,
      authorUserId: taskComments.authorUserId,
      authorContactId: taskComments.authorContactId,
      authorEmail: taskComments.authorEmail,
      body: taskComments.body,
      visibility: taskComments.visibility,
      authorSide: taskComments.authorSide,
      emailMessageId: taskComments.emailMessageId,
      emailDirection: taskComments.emailDirection,
      emailSender: taskComments.emailSender,
      occurredAt: taskComments.occurredAt,
      importedAt: taskComments.importedAt,
      importedByContactId: taskComments.importedByContactId,
      importedByActor: taskComments.importedByActor,
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
        visibilityFilter,
      ),
    )
    .orderBy(
      limit
        ? desc(taskComments.occurredAt)
        : asc(taskComments.occurredAt),
    );

  const rows = limit ? await baseQuery.limit(limit) : await baseQuery;

  if (limit) {
    rows.reverse();
  }
  return rows;
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
  const id = newId();
  const visibility =
    input.visibility === "internal" ? "internal" : "client_visible";
  const authorSide =
    input.authorSide === "client" || input.authorSide === "team"
      ? input.authorSide
      : author.kind === "contact" || profile.contactId
        ? "client"
        : "team";
  const now = new Date();

  const [row] = await executor
    .insert(taskComments)
    .values({
      id,
      workspaceId,
      taskId,
      parentCommentId,
      authorUserId: profile.userId,
      authorContactId: profile.contactId,
      authorEmail: profile.email,
      body: input.body.trim(),
      visibility,
      authorSide,
      occurredAt: now,
    })
    .returning();

  if (!row) return null;

  await upsertCommentActivity(
    workspaceId,
    {
      id: row.id,
      taskId,
      body: row.body,
      parentId: row.parentCommentId ?? null,
      resolvedAt: row.resolvedAt,
      actorUserId: profile.userId,
      actorContactId: profile.contactId,
      actorEmail: profile.email,
      actorName: profile.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      visibility: row.visibility,
      authorSide: row.authorSide,
      occurredAt: row.occurredAt,
    },
    executor,
  );

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
    visibility?: string;
    authorSide?: string | null;
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

  if (input.visibility !== undefined) {
    patch.visibility =
      input.visibility === "internal" ? "internal" : "client_visible";
  }

  if (input.authorSide !== undefined) {
    patch.authorSide =
      input.authorSide === "client" || input.authorSide === "team"
        ? input.authorSide
        : null;
  }

  if (
    patch.body === undefined &&
    input.resolvedAt === undefined &&
    input.visibility === undefined &&
    input.authorSide === undefined
  ) {
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

  await upsertCommentActivity(
    workspaceId,
    {
      id: row.id,
      taskId,
      body: row.body,
      parentId: row.parentCommentId ?? null,
      resolvedAt: row.resolvedAt,
      actorUserId: row.authorUserId,
      actorContactId: row.authorContactId,
      actorEmail: row.authorEmail,
      actorName: profile.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      visibility: row.visibility,
      authorSide: row.authorSide,
      emailMessageId: row.emailMessageId,
      emailDirection: row.emailDirection,
      emailSender: row.emailSender,
      occurredAt: row.occurredAt,
      importedAt: row.importedAt,
      importedByContactId: row.importedByContactId,
      importedByActor: row.importedByActor,
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

  const deletedIds =
    existing.parentCommentId == null
      ? (
          await executor
            .select({ id: taskComments.id })
            .from(taskComments)
            .where(
              and(
                eq(taskComments.taskId, taskId),
                eq(taskComments.workspaceId, workspaceId),
                or(
                  eq(taskComments.id, commentId),
                  eq(taskComments.parentCommentId, commentId),
                ),
              ),
            )
        ).map((row) => row.id)
      : [commentId];
  // Always include the root id even if the select raced.
  if (!deletedIds.includes(commentId)) deletedIds.push(commentId);
  await softDeleteCommentActivities(
    workspaceId,
    taskId,
    deletedIds,
    now,
    executor,
  );

  return true;
}

export async function getTaskCommentRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(taskComments)
    .where(
      and(eq(taskComments.workspaceId, workspaceId), eq(taskComments.id, id)),
    )
    .limit(1);
  return row ?? null;
}

export type CreateTaskCommentRowInput = {
  taskId: string;
  body: string;
  parentCommentId?: string | null;
  authorUserId?: string | null;
  authorContactId?: string | null;
  authorEmail?: string | null;
  visibility?: "client_visible" | "internal" | null;
  authorSide?: "client" | "team" | null;
  emailMessageId?: string | null;
  emailDirection?: "inbound" | "outbound" | null;
  emailSender?: string | null;
  occurredAt?: Date | string | null;
  createdAt?: Date | string | null;
  importedAt?: Date | string | null;
  importedByContactId?: string | null;
  importedByActor?: "user" | "agent" | null;
};

function parseOptionalDate(
  value: Date | string | null | undefined,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createTaskCommentRow(
  workspaceId: string,
  id: string,
  input: CreateTaskCommentRowInput,
  executor: DbExecutor = db,
) {
  const [task] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
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
          eq(taskComments.taskId, input.taskId),
          eq(taskComments.workspaceId, workspaceId),
          isNull(taskComments.deletedAt),
        ),
      )
      .limit(1);
    if (!parent || parent.parentCommentId != null) return null;
  }

  const body = input.body.trim();
  if (!body) return null;

  const now = new Date();
  const occurredAt = parseOptionalDate(input.occurredAt) ?? now;
  const createdAt = parseOptionalDate(input.createdAt) ?? occurredAt;
  const importedAt = parseOptionalDate(input.importedAt);
  const visibility =
    input.visibility === "internal" ? "internal" : "client_visible";
  const authorSide =
    input.authorSide === "client" || input.authorSide === "team"
      ? input.authorSide
      : null;

  const [row] = await executor
    .insert(taskComments)
    .values({
      id,
      workspaceId,
      taskId: input.taskId,
      parentCommentId,
      authorUserId: input.authorUserId ?? null,
      authorContactId: input.authorContactId ?? null,
      authorEmail: input.authorEmail?.trim() || null,
      body,
      visibility,
      authorSide,
      emailMessageId: input.emailMessageId?.trim() || null,
      emailDirection:
        input.emailDirection === "inbound" || input.emailDirection === "outbound"
          ? input.emailDirection
          : null,
      emailSender: input.emailSender?.trim() || null,
      occurredAt,
      createdAt,
      importedAt,
      importedByContactId: input.importedByContactId ?? null,
      importedByActor:
        input.importedByActor === "user" || input.importedByActor === "agent"
          ? input.importedByActor
          : null,
    })
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

  await upsertCommentActivity(
    workspaceId,
    {
      id: row.id,
      taskId: row.taskId,
      body: row.body,
      parentId: row.parentCommentId ?? null,
      resolvedAt: row.resolvedAt,
      actorUserId: row.authorUserId,
      actorContactId: row.authorContactId,
      actorEmail: row.authorEmail,
      actorName: profile.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      visibility: row.visibility,
      authorSide: row.authorSide,
      emailMessageId: row.emailMessageId,
      emailDirection: row.emailDirection,
      emailSender: row.emailSender,
      occurredAt: row.occurredAt,
      importedAt: row.importedAt,
      importedByContactId: row.importedByContactId,
      importedByActor: row.importedByActor,
    },
    executor,
  );

  return row;
}

const EMPTY_EMAIL_PLACEHOLDER = "(empty email)";

export async function findTaskCommentByEmailMessageId(
  workspaceId: string,
  emailMessageId: string,
  executor: DbExecutor = db,
  options?: {
    taskId?: string;
    /** When true (default), include soft-deleted rows so sync does not recreate them. */
    includeDeleted?: boolean;
  },
) {
  const messageId = emailMessageId.trim();
  if (!messageId) return null;
  const includeDeleted = options?.includeDeleted !== false;
  const taskId = options?.taskId?.trim() || null;
  const [row] = await executor
    .select()
    .from(taskComments)
    .where(
      and(
        eq(taskComments.workspaceId, workspaceId),
        eq(taskComments.emailMessageId, messageId),
        taskId ? eq(taskComments.taskId, taskId) : undefined,
        includeDeleted ? undefined : isNull(taskComments.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Idempotent email → ticket timeline entry. Returns `{ created: false }` when
 * the message id already exists for this task (including soft-deleted).
 * Replaces the `(empty email)` placeholder when a real body arrives.
 * Never sends mail.
 */
export async function upsertEmailTimelineComment(
  workspaceId: string,
  input: {
    taskId: string;
    emailMessageId: string;
    body: string;
    emailDirection: "inbound" | "outbound";
    emailSender?: string | null;
    authorContactId?: string | null;
    authorEmail?: string | null;
    authorSide: "client" | "team";
    occurredAt: Date | string;
    visibility?: "client_visible" | "internal";
    imported?: boolean;
    importedByContactId?: string | null;
    importedByActor?: "user" | "agent" | null;
    id?: string;
  },
  executor: DbExecutor = db,
): Promise<{ row: typeof taskComments.$inferSelect; created: boolean } | null> {
  const emailMessageId = input.emailMessageId.trim();
  if (!emailMessageId) return null;

  const existing = await findTaskCommentByEmailMessageId(
    workspaceId,
    emailMessageId,
    executor,
    { taskId: input.taskId, includeDeleted: true },
  );
  if (existing) {
    const nextBody = input.body.trim();
    const shouldReplacePlaceholder =
      !existing.deletedAt &&
      existing.body.trim() === EMPTY_EMAIL_PLACEHOLDER &&
      nextBody.length > 0 &&
      nextBody !== EMPTY_EMAIL_PLACEHOLDER;
    if (shouldReplacePlaceholder) {
      const [updated] = await executor
        .update(taskComments)
        .set({
          body: nextBody,
          emailSender: input.emailSender?.trim() || existing.emailSender,
          authorEmail: input.authorEmail?.trim() || existing.authorEmail,
          authorContactId: input.authorContactId ?? existing.authorContactId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskComments.id, existing.id),
            eq(taskComments.workspaceId, workspaceId),
          ),
        )
        .returning();
      if (updated) {
        await upsertCommentActivity(
          workspaceId,
          {
            id: updated.id,
            taskId: updated.taskId,
            body: updated.body,
            parentId: updated.parentCommentId ?? null,
            resolvedAt: updated.resolvedAt,
            actorUserId: updated.authorUserId,
            actorContactId: updated.authorContactId,
            actorEmail: updated.authorEmail,
            actorName: activityActorName({
              actorUserId: updated.authorUserId,
              actorContactId: updated.authorContactId,
              actorEmail: updated.authorEmail,
              userDisplayName: null,
              contactName: null,
            }),
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            visibility: updated.visibility,
            authorSide: updated.authorSide,
            emailMessageId: updated.emailMessageId,
            emailDirection: updated.emailDirection,
            emailSender: updated.emailSender,
            occurredAt: updated.occurredAt,
            importedAt: updated.importedAt,
            importedByContactId: updated.importedByContactId,
            importedByActor: updated.importedByActor,
          },
          executor,
        );
        return { row: updated, created: false };
      }
    }
    return { row: existing, created: false };
  }

  const occurredAt = parseOptionalDate(input.occurredAt) ?? new Date();
  const importedAt = input.imported ? new Date() : null;
  const id = input.id?.trim() || newId();

  try {
    const row = await createTaskCommentRow(
      workspaceId,
      id,
      {
        taskId: input.taskId,
        body: input.body,
        authorContactId: input.authorContactId ?? null,
        authorEmail: input.authorEmail ?? null,
        visibility: input.visibility ?? "client_visible",
        authorSide: input.authorSide,
        emailMessageId,
        emailDirection: input.emailDirection,
        emailSender: input.emailSender ?? null,
        occurredAt,
        createdAt: occurredAt,
        importedAt,
        importedByContactId: input.imported ? input.importedByContactId ?? null : null,
        importedByActor: input.imported ? input.importedByActor ?? null : null,
      },
      executor,
    );
    if (!row) return null;
    return { row, created: true };
  } catch (error) {
    // Concurrent insert on unique (workspace, task, email_message_id) — treat as skip.
    const existingAfter = await findTaskCommentByEmailMessageId(
      workspaceId,
      emailMessageId,
      executor,
      { taskId: input.taskId, includeDeleted: true },
    );
    if (existingAfter) {
      return { row: existingAfter, created: false };
    }
    throw error;
  }
}

export async function softDeleteTaskCommentRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const existing = await getTaskCommentRow(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;

  const ok = await deleteTaskComment(
    workspaceId,
    existing.taskId,
    id,
    executor,
  );
  if (!ok) return null;

  return getTaskCommentRow(workspaceId, id, executor);
}
