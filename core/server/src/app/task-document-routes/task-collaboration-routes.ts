import {
  attachImagesToCommentBody,
  buildTaskActivityRestPayload,
  buildTaskCommentRestPayload,
  commitRestEntityWrite,
  createTaskActivitySchema,
  createTaskCommentSchema,
  db,
  forbidden,
  getAuth,
  isRestLeaderFirstWrite,
  listActivitiesQuerySchema,
  listTaskAgentPresenceQuerySchema,
  newId,
  notFound,
  notifyPeerOfEntityWrite,
  readIdempotencyKey,
  recordTaskActivityRestSyncEvent,
  recordTaskCommentRestSyncEvent,
  requireScope,
  routeTaskId,
  streamSSE,
  subscribeAgentPresence,
  taskActivityService,
  taskAgentPresenceService,
  taskCommentService,
  taskImageService,
  taskProjectService,
  toTaskActivity,
  toTaskComment,
  unauthorized,
  updateTaskCommentSchema,
  updateTaskTimerSessionActorSchema,
  upsertTaskAgentPresenceSchema,
  withIdempotency,
  writeActorForComment,
  writeActorFromAuth,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Task comments, activity log and agent presence. */
export function registerTaskCollaborationRoutes(app: Hono) {
  app.get(
    "/api/v1/activities",
    zValidator("query", listActivitiesQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const query = c.req.valid("query");
      const types = query.types
        ? query.types
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;
      const result = await taskActivityService.listActivities(auth.workspaceId, {
        taskId: query.taskId,
        projectId: query.projectId,
        types,
        includeDeleted: query.includeDeleted,
        limit: query.limit,
        cursor: query.cursor,
      });
      if (!result) {
        return c.json(
          notFound(query.taskId ? "Task" : "Project"),
          404,
        );
      }
      return c.json({
        activities: result.rows.map(toTaskActivity),
        nextCursor: result.nextCursor,
      });
    },
  );

  app.get("/api/v1/tasks/:id/comments", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const rows = await taskCommentService.listTaskComments(
      auth.workspaceId,
      taskId,
    );
    if (!rows) return c.json(notFound("Task"), 404);
    const mapped = rows.map(toTaskComment);
    const byComment = await taskImageService.listTaskImagesForComments(
      auth.workspaceId,
      taskId,
      mapped.map((comment) => comment.id),
    );
    return c.json({
      comments: mapped.map((comment) => ({
        ...comment,
        images: byComment.get(comment.id) ?? [],
      })),
    });
  });

  app.get("/api/v1/tasks/:id/activities", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const rows = await taskActivityService.listTaskActivities(
      auth.workspaceId,
      taskId,
    );
    if (!rows) return c.json(notFound("Task"), 404);
    return c.json({ activities: rows.map(toTaskActivity) });
  });

  app.get(
    "/api/v1/agent-presence",
    zValidator("query", listTaskAgentPresenceQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const query = c.req.valid("query");
      const presence = await taskAgentPresenceService.listLiveTaskAgentPresence(
        auth.workspaceId,
        { projectId: query.projectId },
      );
      return c.json({ presence });
    },
  );

  /** Live agent-working hints for open shells (instant pulse; poll is fallback). */
  app.get("/api/v1/agent-presence/events", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 16;
      const unsubscribe = subscribeAgentPresence(workspaceId, (event) => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        void stream
          .writeSSE({
            event: "agent.presence",
            data: JSON.stringify({
              taskId: event.taskId,
              live: event.live,
            }),
          })
          .catch(() => {
            closed = true;
            unsubscribe();
          })
          .finally(() => {
            pendingWrites = Math.max(0, pendingWrites - 1);
          });
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      await stream.writeSSE({
        event: "ready",
        data: JSON.stringify({ ok: true }),
      });
      while (!closed) {
        await stream.sleep(15_000);
        if (closed) break;
        try {
          await stream.writeSSE({ event: "ping", data: "{}" });
        } catch {
          closed = true;
          break;
        }
      }
      unsubscribe();
    });
  });

  app.put(
    "/api/v1/tasks/:id/agent-presence",
    zValidator("json", upsertTaskAgentPresenceSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const body = c.req.valid("json");
      const presence = await taskAgentPresenceService.upsertTaskAgentPresence(
        auth.workspaceId,
        taskId,
        {
          source: body.source,
          sessionId: body.sessionId,
        },
      );
      if (!presence) return c.json(notFound("Task"), 404);
      return c.json(presence);
    },
  );

  app.delete("/api/v1/tasks/:id/agent-presence", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const task = await taskProjectService.getTaskById(auth.workspaceId, taskId);
    if (!task) return c.json(notFound("Task"), 404);
    await taskAgentPresenceService.clearTaskAgentPresence(
      auth.workspaceId,
      taskId,
    );
    return c.body(null, 204);
  });

  app.post(
    "/api/v1/tasks/:id/activities",
    zValidator("json", createTaskActivitySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const body = c.req.valid("json");
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      if (isRestLeaderFirstWrite()) {
        const existingTask = await taskProjectService.getTaskById(
          auth.workspaceId,
          taskId,
        );
        if (!existingTask) return c.json(notFound("Task"), 404);
        const activityId = newId();
        const actor = writeActorFromAuth(auth);
        const profile = await taskCommentService.resolveWriteActorProfile(
          auth.workspaceId,
          actor,
          db,
        );
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task_activity",
          entityId: activityId,
          operation: "upsert",
          payload: buildTaskActivityRestPayload(activityId, taskId, {
            type: body.type,
            data: body.data ?? {},
            actorUserId: profile.userId,
            actorContactId: profile.contactId,
            actorEmail: profile.email,
            actorName: profile.name,
          }),
        });
        const row = await taskActivityService.getTaskActivityRow(
          auth.workspaceId,
          activityId,
        );
        if (!row) {
          return c.json(
            { error: "Activity create failed", code: "internal" },
            500,
          );
        }
        return c.json(toTaskActivity(row), 201);
      }
      const row = await taskActivityService.createClientTaskActivity(
        auth.workspaceId,
        taskId,
        body.type,
        body.data ?? {},
        writeActorFromAuth(auth),
      );
      if (!row) return c.json(notFound("Task"), 404);
      await recordTaskActivityRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toTaskActivity(row), 201);
    },
  );

  app.delete("/api/v1/tasks/:taskId/activities/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("taskId");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const activityId = c.req.param("id");
    const existing = await taskActivityService.getTaskActivityRow(
      auth.workspaceId,
      activityId,
    );
    if (
      !existing ||
      existing.taskId !== taskId ||
      (existing.type !== "timer_started" && existing.type !== "timer_stopped")
    ) {
      return c.json(notFound("Activity"), 404);
    }

    const deleted = await taskActivityService.deleteTaskTimerSession(
      auth.workspaceId,
      taskId,
      activityId,
    );
    if (!deleted) return c.json(notFound("Activity"), 404);
    await recordTaskActivityRestSyncEvent(
      auth.workspaceId,
      deleted.start,
      "delete",
    );
    if (deleted.stop) {
      await recordTaskActivityRestSyncEvent(
        auth.workspaceId,
        deleted.stop,
        "delete",
      );
    }
    const { notifyPeerOfEntityWrite } = await import(
      "../../services/core-replication/nudge.js"
    );
    const { publishWorkspaceUpdatedFromSyncEvent } = await import(
      "../../services/core-replication/sync-event-live-publish.js"
    );
    publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
      entity: "task_activity",
      entityId: deleted.start.id,
      operation: "delete",
      payload: { task_id: taskId },
    });
    if (deleted.stop) {
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_activity",
        entityId: deleted.stop.id,
        operation: "delete",
        payload: { task_id: taskId },
      });
    }
    notifyPeerOfEntityWrite({
      workspaceId: auth.workspaceId,
      reason: "rest",
      entity: "task_activity",
      entityId: deleted.start.id,
      taskId,
      operation: "delete",
    });
    return c.body(null, 204);
  });

  app.patch(
    "/api/v1/tasks/:taskId/activities/:id",
    zValidator("json", updateTaskTimerSessionActorSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const taskIdRaw = c.req.param("taskId");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const activityId = c.req.param("id");
      const body = c.req.valid("json");
      const updated = await taskActivityService.updateTaskTimerSessionActor(
        auth.workspaceId,
        taskId,
        activityId,
        body.actorContactId,
      );
      if (!updated) return c.json(notFound("Activity"), 404);

      await recordTaskActivityRestSyncEvent(
        auth.workspaceId,
        updated.start,
        "upsert",
      );
      if (updated.stop) {
        await recordTaskActivityRestSyncEvent(
          auth.workspaceId,
          updated.stop,
          "upsert",
        );
      }
      const { notifyPeerOfEntityWrite } = await import(
        "../../services/core-replication/nudge.js"
      );
      const { publishWorkspaceUpdatedFromSyncEvent } = await import(
        "../../services/core-replication/sync-event-live-publish.js"
      );
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_activity",
        entityId: updated.start.id,
        operation: "upsert",
        payload: { task_id: taskId },
      });
      if (updated.stop) {
        publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
          entity: "task_activity",
          entityId: updated.stop.id,
          operation: "upsert",
          payload: { task_id: taskId },
        });
      }
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "rest",
        entity: "task_activity",
        entityId: updated.start.id,
        taskId,
        operation: "upsert",
      });
      return c.json(toTaskActivity(updated.stop ?? updated.start));
    },
  );

  app.post(
    "/api/v1/tasks/:id/comments",
    zValidator("json", createTaskCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const body = c.req.valid("json");
      const { images: imageUploads, ...commentFields } = body;
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const actor = writeActorForComment(auth, {
        activityActor: commentFields.activityActor,
        authorContactId: commentFields.authorContactId,
      });

      const withImages = async (
        row: NonNullable<
          Awaited<ReturnType<typeof taskCommentService.getTaskCommentRow>>
        >,
      ) => {
        let mapped = toTaskComment(row);
        let images: Awaited<
          ReturnType<typeof taskImageService.listTaskImages>
        > = [];
        if (imageUploads?.length) {
          const attached = await attachImagesToCommentBody(
            auth.workspaceId,
            taskId,
            row.id,
            imageUploads,
            row.body,
          );
          if (!attached.ok) {
            return {
              status: attached.status as 400 | 404,
              body: { error: attached.error, code: "bad_request" as const },
            };
          }
          images = attached.images;
          const refreshed = await taskCommentService.getTaskCommentRow(
            auth.workspaceId,
            row.id,
          );
          if (refreshed) mapped = toTaskComment(refreshed);
        }
        return {
          status: 201 as const,
          body: { ...mapped, images },
        };
      };

      const runCreate = async () => {
        if (isRestLeaderFirstWrite()) {
          const existingTask = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!existingTask) {
            return {
              status: 404 as const,
              body: notFound("Task"),
            };
          }
          const commentId = newId();
          const profile = await taskCommentService.resolveWriteActorProfile(
            auth.workspaceId,
            actor,
            db,
          );
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task_comment",
            entityId: commentId,
            operation: "upsert",
            payload: buildTaskCommentRestPayload(commentId, taskId, {
              body: commentFields.body,
              parentCommentId: commentFields.parentCommentId,
              authorUserId: profile.userId,
              authorContactId: profile.contactId,
              authorEmail: profile.email,
            }),
          });
          const row = await taskCommentService.getTaskCommentRow(
            auth.workspaceId,
            commentId,
          );
          if (!row) {
            return {
              status: 500 as const,
              body: { error: "Comment create failed", code: "internal" },
            };
          }
          return withImages(row);
        }
        const row = await taskCommentService.createTaskComment(
          auth.workspaceId,
          taskId,
          commentFields,
          actor,
        );
        if (!row) {
          return { status: 404 as const, body: notFound("Task") };
        }
        await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
        const { notifyPeerOfEntityWrite } = await import(
          "../../services/core-replication/nudge.js"
        );
        const { publishWorkspaceUpdatedFromSyncEvent } = await import(
          "../../services/core-replication/sync-event-live-publish.js"
        );
        publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
          entity: "task_comment",
          entityId: row.id,
          operation: "upsert",
          payload: { task_id: taskId },
        });
        notifyPeerOfEntityWrite({
          workspaceId: auth.workspaceId,
          reason: "rest",
          entity: "task_comment",
          entityId: row.id,
          taskId,
          operation: "upsert",
        });
        return withImages(row);
      };

      const idempotencyKey = readIdempotencyKey(
        c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key"),
      );
      const scope =
        auth.apiKeyId != null
          ? `api_key:${auth.apiKeyId}:task_comment`
          : `ws:${auth.workspaceId}:task_comment`;
      const result = idempotencyKey
        ? await withIdempotency(scope, idempotencyKey, runCreate)
        : await runCreate();
      return c.json(
        result.body,
        result.status as 201 | 400 | 404 | 500,
      );
    },
  );

  app.patch(
    "/api/v1/tasks/:taskId/comments/:id",
    zValidator("json", updateTaskCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const taskIdRaw = c.req.param("taskId");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const commentId = c.req.param("id");
      const { images: imageUploads, ...patch } = c.req.valid("json");
      let row;
      if (isRestLeaderFirstWrite()) {
        const existing = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!existing || existing.taskId !== taskId) {
          return c.json(notFound("Comment"), 404);
        }
        if (Object.keys(patch).length > 0) {
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task_comment",
            entityId: commentId,
            operation: "upsert",
            payload: buildTaskCommentRestPayload(commentId, taskId, patch),
          });
        }
        row = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!row) return c.json(notFound("Comment"), 404);
      } else {
        if (Object.keys(patch).length > 0) {
          row = await taskCommentService.updateTaskComment(
            auth.workspaceId,
            taskId,
            commentId,
            patch,
          );
          if (!row) return c.json(notFound("Comment"), 404);
          await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
          const { notifyPeerOfEntityWrite } = await import(
            "../../services/core-replication/nudge.js"
          );
          const { publishWorkspaceUpdatedFromSyncEvent } = await import(
            "../../services/core-replication/sync-event-live-publish.js"
          );
          publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
            entity: "task_comment",
            entityId: row.id,
            operation: "upsert",
            payload: { task_id: taskId },
          });
          notifyPeerOfEntityWrite({
            workspaceId: auth.workspaceId,
            reason: "rest",
            entity: "task_comment",
            entityId: row.id,
            taskId,
            operation: "upsert",
          });
        } else {
          row = await taskCommentService.getTaskCommentRow(
            auth.workspaceId,
            commentId,
          );
          if (!row || row.taskId !== taskId) {
            return c.json(notFound("Comment"), 404);
          }
        }
      }

      let mapped = toTaskComment(row);
      let images =
        (await taskImageService.listTaskImages(auth.workspaceId, taskId, {
          commentId,
        })) ?? [];
      if (imageUploads?.length) {
        const attached = await attachImagesToCommentBody(
          auth.workspaceId,
          taskId,
          commentId,
          imageUploads,
          row.body,
        );
        if (!attached.ok) {
          return c.json(
            { error: attached.error, code: "bad_request" },
            attached.status,
          );
        }
        images = attached.images;
        const refreshed = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (refreshed) mapped = toTaskComment(refreshed);
      }
      return c.json({ ...mapped, images });
    },
  );

  app.delete("/api/v1/tasks/:taskId/comments/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const commentId = c.req.param("id");
    const taskIdRaw = c.req.param("taskId");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const existing = await taskCommentService.getTaskCommentRow(
      auth.workspaceId,
      commentId,
    );
    if (!existing || existing.taskId !== taskId) {
      return c.json(notFound("Comment"), 404);
    }
    if (isRestLeaderFirstWrite()) {
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task_comment",
        entityId: commentId,
        operation: "delete",
        payload: { id: commentId, task_id: taskId },
      });
      return c.body(null, 204);
    }
    const ok = await taskCommentService.deleteTaskComment(
      auth.workspaceId,
      taskId,
      commentId,
    );
    if (!ok) return c.json(notFound("Comment"), 404);
    const deleted = await taskCommentService.getTaskCommentRow(
      auth.workspaceId,
      commentId,
    );
    if (deleted) {
      await recordTaskCommentRestSyncEvent(auth.workspaceId, deleted, "delete");
      const { notifyPeerOfEntityWrite } = await import(
        "../../services/core-replication/nudge.js"
      );
      const { publishWorkspaceUpdatedFromSyncEvent } = await import(
        "../../services/core-replication/sync-event-live-publish.js"
      );
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_comment",
        entityId: commentId,
        operation: "delete",
        payload: { task_id: taskId },
      });
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "rest",
        entity: "task_comment",
        entityId: commentId,
        taskId,
        operation: "delete",
      });
    }
    return c.body(null, 204);
  });
}
