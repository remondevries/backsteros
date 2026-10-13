import type { BacksterosApiClient } from "@backsteros/api-client";
import type { TaskComment } from "@backsteros/contracts";

import { shouldSkipRestEntityWrite } from "./powersync-write-path";
import type { WorkspacePowerSync } from "./workspace-data-types";

export type TaskCommentAuthor = {
  userId: string | null;
  email: string | null;
  contactId?: string | null;
};

function commentApiPath(taskId: string, commentId?: string): string {
  const base = `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`;
  return commentId
    ? `${base}/${encodeURIComponent(commentId)}`
    : base;
}

async function flushCommentCrudUpload(
  powerSync: WorkspacePowerSync,
): Promise<void> {
  if (!powerSync.flushCrudUpload || !shouldSkipRestEntityWrite(powerSync)) {
    return;
  }
  try {
    await powerSync.flushCrudUpload();
  } catch (error) {
    console.warn("[desktop] task comment upload flush deferred", error);
  }
}

export function sqliteRowToTaskComment(row: {
  id: string;
  task_id: string;
  parent_comment_id: string | null;
  author_user_id: string | null;
  author_contact_id: string | null;
  author_email: string | null;
  body: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  contact_name?: string | null;
}): TaskComment {
  const authorContactId = row.author_contact_id;
  const isGenericAgent = !row.author_user_id && !authorContactId;
  let authorName = "Agent";
  if (!isGenericAgent) {
    if (row.contact_name?.trim()) {
      authorName = row.contact_name.trim();
    } else if (row.author_email?.trim()) {
      const local = row.author_email.trim().split("@")[0]?.trim();
      authorName = local || row.author_email.trim();
    } else {
      authorName = "User";
    }
  }

  return {
    id: row.id,
    taskId: row.task_id,
    parentCommentId: row.parent_comment_id,
    authorUserId: row.author_user_id,
    authorContactId,
    authorEmail: row.author_email,
    authorName,
    body: row.body,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function createTaskCommentViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    taskId: string;
    body: string;
    parentCommentId?: string | null;
    author: TaskCommentAuthor;
  },
): Promise<TaskComment> {
  const body = input.body.trim();
  if (!body) throw new Error("Comment body is required");

  const parentCommentId = input.parentCommentId?.trim() || null;

  // Comments must reach cloud-core for the portal. PowerSync-only writes often
  // stayed in SQLite (upload lag / failed flush), so REST is the source of
  // truth. Keep a local row when PowerSync is up for instant desktop paint.
  const created = await client.requestJson<TaskComment>(
    commentApiPath(input.taskId),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body,
        parentCommentId,
      }),
    },
  );

  if (powerSync.ready && powerSync.createMetadata) {
    try {
      await powerSync.createMetadata(
        "task_comments",
        {
          task_id: created.taskId,
          parent_comment_id: created.parentCommentId,
          author_user_id: created.authorUserId,
          author_contact_id: created.authorContactId,
          author_email: created.authorEmail,
          body: created.body,
          resolved_at: created.resolvedAt,
          created_at: created.createdAt,
          updated_at: created.updatedAt,
          deleted_at: created.deletedAt,
        },
        created.id,
      );
      await flushCommentCrudUpload(powerSync);
    } catch (error) {
      console.warn("[desktop] local comment mirror deferred", error);
    }
  }

  return created;
}

export async function patchTaskCommentViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    taskId: string;
    commentId: string;
    existing: TaskComment;
    body?: string;
    resolvedAt?: string | null;
  },
): Promise<TaskComment> {
  const updated = await client.requestJson<TaskComment>(
    commentApiPath(input.taskId, input.commentId),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.body !== undefined ? { body: input.body.trim() } : {}),
        ...(input.resolvedAt !== undefined
          ? { resolvedAt: input.resolvedAt }
          : {}),
      }),
    },
  );

  if (powerSync.ready && powerSync.patchMetadata) {
    try {
      const sqliteValues: Record<string, unknown> = {};
      if (input.body !== undefined) sqliteValues.body = input.body.trim();
      if (input.resolvedAt !== undefined) {
        sqliteValues.resolved_at = input.resolvedAt;
      }
      sqliteValues.updated_at = updated.updatedAt;
      if (Object.keys(sqliteValues).length > 0) {
        await powerSync.patchMetadata(
          "task_comments",
          input.commentId,
          sqliteValues,
        );
        await flushCommentCrudUpload(powerSync);
      }
    } catch (error) {
      console.warn("[desktop] local comment patch mirror deferred", error);
    }
  }

  return updated;
}

async function softDeleteTaskCommentLocally(
  powerSync: WorkspacePowerSync,
  commentId: string,
  deletedAt: string,
): Promise<void> {
  await powerSync.patchMetadata!("task_comments", commentId, {
    deleted_at: deletedAt,
  });
}

export async function deleteTaskCommentViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    taskId: string;
    comment: TaskComment;
    replyIds: string[];
  },
): Promise<void> {
  await client.requestJson<void>(
    commentApiPath(input.taskId, input.comment.id),
    { method: "DELETE" },
  );

  if (powerSync.ready && shouldSkipRestEntityWrite(powerSync)) {
    const deletedAt = new Date().toISOString();
    const idsToDelete = [
      input.comment.id,
      ...input.replyIds.filter((id) => id !== input.comment.id),
    ];
    try {
      for (const id of idsToDelete) {
        await softDeleteTaskCommentLocally(powerSync, id, deletedAt);
      }
      await flushCommentCrudUpload(powerSync);
    } catch (error) {
      console.warn("[desktop] local comment delete mirror deferred", error);
    }
  }
}
