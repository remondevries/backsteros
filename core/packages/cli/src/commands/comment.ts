import type {
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
} from "@backsteros/contracts";
import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";
import { resolveTaskId } from "../resolve.js";

function commentMessage(
  values: Record<string, string | boolean | undefined>,
): string | undefined {
  if (typeof values.message === "string" && values.message.trim()) {
    return values.message;
  }
  if (typeof values.body === "string" && values.body.trim()) {
    return values.body;
  }
  return undefined;
}

function preview(body: string, max = 72): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

export async function runCommentCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): Promise<void> {
  switch (action) {
    case "list": {
      const taskRef = positionals[0];
      if (!taskRef) {
        throw new Error("Usage: backsteros comment list <task id|KEY-number>");
      }
      const taskId = await resolveTaskId(client, taskRef);
      const res = await client.contract.listTaskComments({
        params: { id: taskId },
      });
      if (res.status !== 200) throw new Error(`list failed (${res.status})`);
      const comments = res.body.comments;
      emitResult(
        config.json,
        { comments },
        comments
          .map(
            (c) =>
              `${c.id}\t${c.authorName}\t${preview(c.body)}\t${c.createdAt}`,
          )
          .join("\n") || "(no comments)",
      );
      return;
    }
    case "get": {
      const taskRef = positionals[0];
      const commentId = positionals[1];
      if (!taskRef || !commentId) {
        throw new Error(
          "Usage: backsteros comment get <task id|KEY-number> <comment-id>",
        );
      }
      const taskId = await resolveTaskId(client, taskRef);
      const res = await client.contract.listTaskComments({
        params: { id: taskId },
      });
      if (res.status !== 200) throw new Error(`list failed (${res.status})`);
      const comment = res.body.comments.find((c) => c.id === commentId);
      if (!comment) throw new Error(`Comment not found: ${commentId}`);
      emitResult(
        config.json,
        comment,
        `${comment.id}  ${comment.authorName}  ${preview(comment.body)}`,
      );
      return;
    }
    case "create": {
      const taskRef = positionals[0];
      const message = commentMessage(values);
      if (!taskRef || !message) {
        throw new Error(
          'Usage: backsteros comment create <task id|KEY-number> --message "..."',
        );
      }
      const taskId = await resolveTaskId(client, taskRef);
      const body: CreateTaskCommentInput = {
        body: message,
        activityActor: config.activityActor,
        ...(config.agentContactId
          ? { authorContactId: config.agentContactId }
          : {}),
      };
      if (typeof values.parent === "string") {
        body.parentCommentId = values.parent;
      }
      const res = await client.contract.createTaskComment({
        params: { id: taskId },
        body,
      });
      if (res.status !== 201) throw new Error(`create failed (${res.status})`);
      const c = res.body;
      emitResult(
        config.json,
        c,
        `created comment ${c.id} on ${taskRef}  ${preview(c.body)}`,
      );
      return;
    }
    case "update": {
      const taskRef = positionals[0];
      const commentId = positionals[1];
      const message = commentMessage(values);
      if (!taskRef || !commentId) {
        throw new Error(
          'Usage: backsteros comment update <task id|KEY-number> <comment-id> --message "..."',
        );
      }
      const patch: UpdateTaskCommentInput = {};
      if (message) patch.body = message;
      if (values.resolve === true) {
        patch.resolvedAt = new Date().toISOString();
      }
      if (values.unresolve === true) {
        patch.resolvedAt = null;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error(
          "Provide --message and/or --resolve/--unresolve to update",
        );
      }
      const taskId = await resolveTaskId(client, taskRef);
      const res = await client.contract.updateTaskComment({
        params: { taskId, id: commentId },
        body: patch,
      });
      if (res.status !== 200) throw new Error(`update failed (${res.status})`);
      const c = res.body;
      emitResult(
        config.json,
        c,
        `updated comment ${c.id}  ${preview(c.body)}`,
      );
      return;
    }
    case "delete": {
      const taskRef = positionals[0];
      const commentId = positionals[1];
      if (!taskRef || !commentId) {
        throw new Error(
          "Usage: backsteros comment delete <task id|KEY-number> <comment-id>",
        );
      }
      const taskId = await resolveTaskId(client, taskRef);
      const res = await client.contract.deleteTaskComment({
        params: { taskId, id: commentId },
      });
      if (res.status !== 204) throw new Error(`delete failed (${res.status})`);
      emitResult(
        config.json,
        { ok: true, id: commentId, taskId },
        `deleted comment ${commentId} on ${taskRef}`,
      );
      return;
    }
    default:
      throw new Error(
        `Unknown comment action "${action ?? ""}". Use list|get|create|update|delete.`,
      );
  }
}
