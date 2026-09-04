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
  const sqliteValues: Record<string, unknown> = {
    task_id: input.taskId,
    parent_comment_id: parentCommentId,
    author_user_id: input.author.userId,
    author_contact_id: input.author.contactId ?? null,
    author_email: input.author.email,
    body,
    resolved_at: null,
  };

  if (
    powerSync.ready &&
    powerSync.createMetadata &&
    shouldSkipRestEntityWrite(powerSync)
  ) {
    const id = await powerSync.createMetadata("task_comments", sqliteValues);
    return sqliteRowToTaskComment({
      id,
      task_id: input.taskId,
      parent_comment_id: parentCommentId,
      author_user_id: input.author.userId,
      author_contact_id: input.author.contactId ?? null,
      author_email: input.author.email,
      body,
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    });
  }

  return client.requestJson<TaskComment>(commentApiPath(input.taskId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      body,
      parentCommentId,
    }),
  });
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
  const sqliteValues: Record<string, unknown> = {};
  if (input.body !== undefined) sqliteValues.body = input.body.trim();
  if (input.resolvedAt !== undefined) sqliteValues.resolved_at = input.resolvedAt;

  if (powerSync.ready && Object.keys(sqliteValues).length > 0) {
    try {
      await powerSync.patchMetadata(
        "task_comments",
        input.commentId,
        sqliteValues,
      );
    } catch {
      if (shouldSkipRestEntityWrite(powerSync)) {
        throw new Error("Could not update comment locally.");
      }
    }
  }

  if (shouldSkipRestEntityWrite(powerSync)) {
    const now = new Date().toISOString();
    return {
      ...input.existing,
      body:
        input.body !== undefined ? input.body.trim() : input.existing.body,
      resolvedAt:
        input.resolvedAt !== undefined
          ? input.resolvedAt
          : input.existing.resolvedAt,
      updatedAt: now,
    };
  }

  return client.requestJson<TaskComment>(
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
  const deletedAt = new Date().toISOString();
  const idsToDelete = [
    input.comment.id,
    ...input.replyIds.filter((id) => id !== input.comment.id),
  ];

  if (powerSync.ready && shouldSkipRestEntityWrite(powerSync)) {
    for (const id of idsToDelete) {
      await softDeleteTaskCommentLocally(powerSync, id, deletedAt);
    }
    return;
  }

  await client.requestJson<void>(
    commentApiPath(input.taskId, input.comment.id),
    { method: "DELETE" },
  );
}
