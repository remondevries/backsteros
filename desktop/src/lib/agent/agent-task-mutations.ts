/** Shared agent observer mutations (status + comment) for the desktop shell. */

import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Task as ApiTask } from "@backsteros/contracts";
import { migrateLegacyTaskStatus } from "@backsteros/ui";

import type { AgentHoldDecision } from "./agent-hold";
import {
  canMarkTaskInReview,
  formatAgentReviewComment,
} from "./agent-review";

export type AgentTaskPatchWriter = (
  taskId: string,
  values: Record<string, unknown>,
) => Promise<void>;

async function patchTaskStatus(
  client: BacksterosApiClient,
  taskId: string,
  values: Record<string, unknown>,
  patchTask?: AgentTaskPatchWriter,
): Promise<void> {
  if (patchTask) {
    await patchTask(taskId, values);
    return;
  }
  await client.requestJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

async function getTask(
  client: BacksterosApiClient,
  taskId: string,
): Promise<ApiTask | null> {
  try {
    return await client.requestJson<ApiTask>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    );
  } catch {
    return null;
  }
}

export async function holdTaskForAgent(
  client: BacksterosApiClient,
  taskId: string,
  decision: AgentHoldDecision,
  options?: {
    force?: boolean;
    parentCommentId?: string | null;
    patchTask?: AgentTaskPatchWriter;
  },
): Promise<boolean> {
  const task = await getTask(client, taskId);
  if (!task) return false;
  const status = migrateLegacyTaskStatus(task.status);
  if (
    status === "completed" ||
    status === "canceled" ||
    status === "duplicated"
  ) {
    return false;
  }
  const alreadyOnHold = status === "on_hold";
  // Continuous loop: another hold turn while already on_hold still posts the
  // new comment — only block terminal statuses above.
  if (!options?.force && alreadyOnHold && !decision.commentBody.trim()) {
    return false;
  }
  const parentCommentId = options?.parentCommentId?.trim() || null;
  try {
    if (!alreadyOnHold) {
      await patchTaskStatus(
        client,
        taskId,
        {
          status: "on_hold",
          activityActor: "agent",
        },
        options?.patchTask,
      );
    }
    if (decision.commentBody.trim()) {
      await client.requestJson(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: decision.commentBody,
            activityActor: "agent",
            ...(parentCommentId ? { parentCommentId } : {}),
          }),
        },
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function markTaskInProgressForAgent(
  client: BacksterosApiClient,
  taskId: string,
  patchTask?: AgentTaskPatchWriter,
): Promise<boolean> {
  const task = await getTask(client, taskId);
  if (!task) return false;
  const status = migrateLegacyTaskStatus(task.status);
  if (status === "in_progress") return false;
  if (
    status === "completed" ||
    status === "canceled" ||
    status === "duplicated"
  ) {
    return false;
  }
  try {
    await patchTaskStatus(
      client,
      taskId,
      {
        status: "in_progress",
        activityActor: "agent",
      },
      patchTask,
    );
    return true;
  } catch {
    return false;
  }
}

export async function reviewTaskForAgent(
  client: BacksterosApiClient,
  taskId: string,
  assistantText?: string | null,
  options?: {
    force?: boolean;
    parentCommentId?: string | null;
    patchTask?: AgentTaskPatchWriter;
  },
): Promise<boolean> {
  const task = await getTask(client, taskId);
  if (!task) {
    return false;
  }
  const status = migrateLegacyTaskStatus(task.status);
  if (
    status === "completed" ||
    status === "canceled" ||
    status === "duplicated"
  ) {
    return false;
  }
  const alreadyInReview = status === "in_review";
  // Continuous loop: a later successful turn may already be in_review (or
  // briefly still in_progress). Always allow posting the new assistant comment.
  if (!options?.force && !alreadyInReview && !canMarkTaskInReview(status)) {
    return false;
  }
  const commentBody = formatAgentReviewComment(assistantText);
  if (alreadyInReview && !commentBody) {
    return false;
  }
  const parentCommentId = options?.parentCommentId?.trim() || null;
  try {
    if (!alreadyInReview) {
      await patchTaskStatus(
        client,
        taskId,
        {
          status: "in_review",
          activityActor: "agent",
        },
        options?.patchTask,
      );
    }
    if (commentBody) {
      await client.requestJson(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: commentBody,
            activityActor: "agent",
            ...(parentCommentId ? { parentCommentId } : {}),
          }),
        },
      );
    }
    return true;
  } catch {
    return false;
  }
}
