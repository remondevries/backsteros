/**
 * Attach base64 images to a task description or comment body (OS-90).
 */
import type { TaskImage, TaskImageUploadInput } from "@backsteros/contracts";

import {
  appendImageMarkdown,
  createTaskImagesFromUploads,
} from "./task-images.js";
import * as taskCommentService from "./task-comments.js";
import * as taskProjectService from "./tasks-projects.js";
import {
  buildTaskCommentRestPayload,
  buildTaskRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "./rest-leader-write.js";
import {
  recordTaskCommentRestSyncEvent,
  recordTaskRestSyncEvent,
} from "./sync.js";

export type AttachImagesResult =
  | {
      ok: true;
      images: TaskImage[];
      text: string;
    }
  | { ok: false; error: string; status: 400 | 404 };

export async function attachImagesToTaskDescription(
  workspaceId: string,
  taskId: string,
  uploads: readonly TaskImageUploadInput[],
  currentDescription: string | null,
): Promise<AttachImagesResult> {
  if (uploads.length === 0) {
    return { ok: true, images: [], text: currentDescription ?? "" };
  }
  const created = await createTaskImagesFromUploads(
    workspaceId,
    taskId,
    uploads,
  );
  if ("error" in created) {
    return {
      ok: false,
      error: created.error,
      status: created.error === "Task not found" ? 404 : 400,
    };
  }
  const nextDescription = appendImageMarkdown(
    currentDescription,
    created.images.map(({ image, alt }) => ({ url: image.url, alt })),
  );
  if (nextDescription.length > 10_000) {
    return {
      ok: false,
      error: "Description with images exceeds maximum length",
      status: 400,
    };
  }

  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWrite({
      workspaceId,
      entity: "task",
      entityId: taskId,
      operation: "upsert",
      payload: buildTaskRestPayload(taskId, { description: nextDescription }),
    });
  } else {
    const row = await taskProjectService.updateTask(workspaceId, taskId, {
      description: nextDescription,
    });
    if (!row) {
      return { ok: false, error: "Task not found", status: 404 };
    }
    await recordTaskRestSyncEvent(workspaceId, row, "upsert");
  }

  return {
    ok: true,
    images: created.images.map(({ image }) => image),
    text: nextDescription,
  };
}

export async function attachImagesToCommentBody(
  workspaceId: string,
  taskId: string,
  commentId: string,
  uploads: readonly TaskImageUploadInput[],
  currentBody: string,
): Promise<AttachImagesResult> {
  if (uploads.length === 0) {
    return { ok: true, images: [], text: currentBody };
  }
  const created = await createTaskImagesFromUploads(
    workspaceId,
    taskId,
    uploads,
    { commentId },
  );
  if ("error" in created) {
    return {
      ok: false,
      error: created.error,
      status: created.error === "Task not found" ? 404 : 400,
    };
  }
  const nextBody = appendImageMarkdown(
    currentBody,
    created.images.map(({ image, alt }) => ({ url: image.url, alt })),
  );
  if (nextBody.length > 20_000) {
    return {
      ok: false,
      error: "Comment body with images exceeds maximum length",
      status: 400,
    };
  }

  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWrite({
      workspaceId,
      entity: "task_comment",
      entityId: commentId,
      operation: "upsert",
      payload: buildTaskCommentRestPayload(commentId, taskId, {
        body: nextBody,
      }),
    });
  } else {
    const row = await taskCommentService.updateTaskComment(
      workspaceId,
      taskId,
      commentId,
      { body: nextBody },
    );
    if (!row) {
      return { ok: false, error: "Comment not found", status: 404 };
    }
    await recordTaskCommentRestSyncEvent(workspaceId, row, "upsert");
  }

  return {
    ok: true,
    images: created.images.map(({ image }) => image),
    text: nextBody,
  };
}
