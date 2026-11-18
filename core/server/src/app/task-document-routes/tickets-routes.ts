/**
 * OS-187: /api/v1/tickets — support tickets for the agents API.
 * All writes here are guaranteed not to send mail or notify the client.
 */
import {
  buildTaskCommentRestPayload,
  buildTaskRestPayload,
  can,
  commitRestEntityWrite,
  createTicketCommentSchema,
  createTicketFromEmailSchema,
  createTicketSchema,
  db,
  forbidden,
  getAuth,
  isRestLeaderFirstWrite,
  listTicketCommentsQuerySchema,
  listTicketsQuerySchema,
  newId,
  notFound,
  nudgePeerEntityLive,
  parseTaskListQuery,
  recordTaskCommentRestSyncEvent,
  recordTaskRestSyncEvent,
  resolveTaskListFilterRefs,
  routeTaskId,
  syncTicketEmailsSchema,
  taskCommentService,
  taskProjectService,
  taskWithKey,
  tasksWithKeys,
  toTaskComment,
  updateTicketCommentSchema,
  updateTicketSchema,
  writeActorForComment,
  writeActorFromAuth,
  zValidator,
  ListQueryError,
  listQueryErrorBody,
  TaskFilterError,
  TASK_LIST_DEFAULT_EXCLUSION_HINT,
  taskListUsesDefaultStatusExclusion,
  collectQueryParams,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";
import { resolveCommentListVisibility } from "../../lib/comment-visibility-auth.js";
import {
  createTicketFromEmail,
  ticketCreateFields,
  ticketUpdateFields,
} from "../../services/tickets.js";
import { syncTicketLinkedEmails } from "../../services/ticket-email-sync.js";

async function requireSupportTicket(
  workspaceId: string,
  idOrKey: string,
) {
  const taskId = await routeTaskId(workspaceId, idOrKey);
  if (!taskId) return null;
  const row = await taskProjectService.getTaskById(workspaceId, taskId);
  if (!row || !row.support) return null;
  return row;
}

/** Support tickets resource (tasks with support:true). Never sends mail. */
export function registerTicketsRoutes(app: Hono) {
  app.get("/api/v1/tickets", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);

    const raw = collectQueryParams(new URL(c.req.url));
    // Force support filter for the tickets resource.
    raw.support = "true";
    let parsed;
    try {
      parsed = parseTaskListQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    // Validate query against tickets schema (same shape as tasks).
    const queryCheck = listTicketsQuerySchema.safeParse(raw);
    if (!queryCheck.success) {
      return c.json(
        {
          error: "Invalid query",
          code: "bad_request",
          issues: queryCheck.error.issues,
        },
        400,
      );
    }

    if (parsed.mode !== "paginated") {
      const resolved = await resolveTaskListFilterRefs(
        auth.workspaceId,
        parsed,
        { strict: false },
      );
      const page = await taskProjectService.listTasks(auth.workspaceId, {
        projectId: resolved.projectIds,
        contactId: resolved.contactIds,
        assigneeId: resolved.assigneeIds,
        relatedContactId: resolved.relatedContactIds,
        relatedOrganizationId: resolved.relatedOrganizationIds,
        status: resolved.statuses,
        inbox:
          c.req.query("inbox") === undefined
            ? undefined
            : c.req.query("inbox") === "true",
        support: true,
        notification:
          c.req.query("notification") === undefined
            ? undefined
            : c.req.query("notification") === "true",
      });
      const tickets = await tasksWithKeys(auth.workspaceId, page.rows);
      return c.json({
        tickets,
        tasks: tickets,
        has_more: page.hasMore,
        limit: page.limit,
      });
    }

    try {
      const resolved = await resolveTaskListFilterRefs(
        auth.workspaceId,
        { ...parsed, support: true },
        { strict: true },
      );
      resolved.support = true;
      const result = await taskProjectService.listTasksPaginated(
        auth.workspaceId,
        resolved,
      );
      if (taskListUsesDefaultStatusExclusion(resolved)) {
        c.header("X-BacksterOS-Hint", TASK_LIST_DEFAULT_EXCLUSION_HINT);
      }
      return c.json({
        ...result,
        tickets: result.items,
      });
    } catch (error) {
      if (error instanceof TaskFilterError) {
        return c.json(
          {
            error: error.message,
            code: error.code,
            field: error.field,
          },
          400,
        );
      }
      throw error;
    }
  });

  // Static paths before /:id
  app.post(
    "/api/v1/tickets/from-email",
    zValidator("json", createTicketFromEmailSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      const actor = writeActorFromAuth(auth, body.activityActor);
      const result = await createTicketFromEmail(auth.workspaceId, body, {
        activityActor: body.activityActor ?? "agent",
        authorContactId:
          actor.kind === "contact" ? actor.contactId ?? null : null,
      });
      if (!result.ok) {
        if (result.code === "not_found") {
          return c.json(notFound(result.error), 404);
        }
        if (result.code === "bad_request") {
          return c.json({ error: result.error, code: "bad_request" }, 400);
        }
        return c.json({ error: result.error, code: "internal" }, 500);
      }
      const ticket = await taskWithKey(auth.workspaceId, result.ticket);
      nudgePeerEntityLive(auth, "task", result.ticket.id, "upsert");
      return c.json(
        {
          ticket,
          sync: result.sync,
          sentMail: false as const,
        },
        201,
      );
    },
  );

  app.get("/api/v1/tickets/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const row = await requireSupportTicket(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Ticket"), 404);
    const include = c.req.query("include") ?? "";
    const includeComments = include.split(",").includes("comments");
    let comments;
    if (includeComments) {
      const visibility = resolveCommentListVisibility(
        auth,
        c.req.query("visibility"),
      );
      const listed = await taskCommentService.listTaskComments(
        auth.workspaceId,
        row.id,
        db,
        { limit: 20, visibility },
      );
      comments = (listed ?? []).map(toTaskComment);
    }
    return c.json(
      await taskWithKey(auth.workspaceId, row, {
        comments,
      }),
    );
  });

  app.post(
    "/api/v1/tickets",
    zValidator("json", createTicketSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const body = ticketCreateFields(c.req.valid("json"));
      const actor = writeActorFromAuth(auth, body.activityActor);
      if (isRestLeaderFirstWrite()) {
        const taskId = body.id?.trim() || newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task",
          entityId: taskId,
          operation: "upsert",
          payload: buildTaskRestPayload(taskId, { ...body, support: true }),
        });
        const row = await taskProjectService.getTaskById(
          auth.workspaceId,
          taskId,
        );
        if (!row) {
          return c.json({ error: "Ticket create failed", code: "internal" }, 500);
        }
        nudgePeerEntityLive(auth, "task", row.id, "upsert");
        return c.json(await taskWithKey(auth.workspaceId, row), 201);
      }
      const created = await taskProjectService.createTask(
        auth.workspaceId,
        body,
        body.id?.trim() || newId(),
        undefined,
        actor,
      );
      await recordTaskRestSyncEvent(auth.workspaceId, created, "upsert");
      nudgePeerEntityLive(auth, "task", created.id, "upsert");
      const row = await taskProjectService.getTaskById(
        auth.workspaceId,
        created.id,
      );
      return c.json(await taskWithKey(auth.workspaceId, row ?? created), 201);
    },
  );

  app.patch(
    "/api/v1/tickets/:id",
    zValidator("json", updateTicketSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const existing = await requireSupportTicket(
        auth.workspaceId,
        c.req.param("id"),
      );
      if (!existing) return c.json(notFound("Ticket"), 404);
      const patch = ticketUpdateFields(c.req.valid("json"));
      const actor = writeActorFromAuth(auth, patch.activityActor);
      if (isRestLeaderFirstWrite()) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task",
          entityId: existing.id,
          operation: "upsert",
          payload: buildTaskRestPayload(existing.id, {
            ...patch,
            support: true,
          }),
        });
        const row = await taskProjectService.getTaskById(
          auth.workspaceId,
          existing.id,
        );
        if (!row) return c.json(notFound("Ticket"), 404);
        nudgePeerEntityLive(auth, "task", row.id, "upsert");
        return c.json(await taskWithKey(auth.workspaceId, row));
      }
      const updated = await taskProjectService.updateTask(
        auth.workspaceId,
        existing.id,
        patch,
        db,
        actor,
      );
      if (!updated) return c.json(notFound("Ticket"), 404);
      await recordTaskRestSyncEvent(auth.workspaceId, updated, "upsert");
      nudgePeerEntityLive(auth, "task", updated.id, "upsert");
      const row = await taskProjectService.getTaskById(
        auth.workspaceId,
        updated.id,
      );
      return c.json(await taskWithKey(auth.workspaceId, row ?? updated));
    },
  );

  app.post(
    "/api/v1/tickets/:id/sync-emails",
    zValidator("json", syncTicketEmailsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const existing = await requireSupportTicket(
        auth.workspaceId,
        c.req.param("id"),
      );
      if (!existing) return c.json(notFound("Ticket"), 404);
      const body = c.req.valid("json");
      const actor = writeActorFromAuth(auth, body.activityActor);
      const result = await syncTicketLinkedEmails({
        workspaceId: auth.workspaceId,
        taskId: existing.id,
        backfill: body.backfill === true,
        activityActor: body.activityActor ?? "agent",
        authorContactId:
          body.authorContactId ??
          (actor.kind === "contact" ? actor.contactId ?? null : null),
      });
      if (!result) return c.json(notFound("Ticket"), 404);
      return c.json(result);
    },
  );

  app.get("/api/v1/tickets/:id/comments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const existing = await requireSupportTicket(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!existing) return c.json(notFound("Ticket"), 404);
    const query = listTicketCommentsQuerySchema.parse({
      visibility: c.req.query("visibility") ?? undefined,
      limit: c.req.query("limit"),
    });
    const visibility = resolveCommentListVisibility(auth, query.visibility);
    const rows = await taskCommentService.listTaskComments(
      auth.workspaceId,
      existing.id,
      db,
      {
        visibility,
        limit: query.limit,
      },
    );
    return c.json({ comments: (rows ?? []).map(toTaskComment) });
  });

  app.post(
    "/api/v1/tickets/:id/comments",
    zValidator("json", createTicketCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const existing = await requireSupportTicket(
        auth.workspaceId,
        c.req.param("id"),
      );
      if (!existing) return c.json(notFound("Ticket"), 404);
      const body = c.req.valid("json");
      const actor = writeActorForComment(auth, body);

      if (isRestLeaderFirstWrite()) {
        const commentId = newId();
        const profile = await taskCommentService.resolveWriteActorProfile(
          auth.workspaceId,
          actor,
          db,
        );
        const visibility =
          body.visibility === "internal" ? "internal" : "client_visible";
        const authorSide =
          body.authorSide === "client" || body.authorSide === "team"
            ? body.authorSide
            : actor.kind === "contact"
              ? "client"
              : "team";
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task_comment",
          entityId: commentId,
          operation: "upsert",
          payload: buildTaskCommentRestPayload(commentId, existing.id, {
            body: body.body,
            parentCommentId: body.parentCommentId,
            authorUserId: profile.userId,
            authorContactId: profile.contactId,
            authorEmail: profile.email,
            visibility,
            authorSide,
          }),
        });
        const row = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!row) {
          return c.json(
            { error: "Comment create failed", code: "internal" },
            500,
          );
        }
        nudgePeerEntityLive(auth, "task_comment", row.id, "upsert");
        return c.json(toTaskComment(row), 201);
      }

      const row = await taskCommentService.createTaskComment(
        auth.workspaceId,
        existing.id,
        body,
        actor,
      );
      if (!row) return c.json(notFound("Ticket"), 404);
      await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
      nudgePeerEntityLive(auth, "task_comment", row.id, "upsert");
      return c.json(toTaskComment(row), 201);
    },
  );

  app.patch(
    "/api/v1/tickets/:id/comments/:commentId",
    zValidator("json", updateTicketCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const existing = await requireSupportTicket(
        auth.workspaceId,
        c.req.param("id"),
      );
      if (!existing) return c.json(notFound("Ticket"), 404);
      const commentId = c.req.param("commentId");
      const patch = c.req.valid("json");

      // Verify the comment belongs to this ticket before any write.
      const existingComment = await taskCommentService.getTaskCommentRow(
        auth.workspaceId,
        commentId,
      );
      if (
        !existingComment ||
        existingComment.taskId !== existing.id ||
        existingComment.deletedAt
      ) {
        return c.json(notFound("Comment"), 404);
      }

      if (isRestLeaderFirstWrite()) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task_comment",
          entityId: commentId,
          operation: "upsert",
          payload: buildTaskCommentRestPayload(commentId, existing.id, patch),
        });
        const row = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!row || row.taskId !== existing.id) {
          return c.json(notFound("Comment"), 404);
        }
        nudgePeerEntityLive(auth, "task_comment", row.id, "upsert");
        return c.json(toTaskComment(row));
      }

      const row = await taskCommentService.updateTaskComment(
        auth.workspaceId,
        existing.id,
        commentId,
        patch,
      );
      if (!row) return c.json(notFound("Comment"), 404);
      await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
      nudgePeerEntityLive(auth, "task_comment", row.id, "upsert");
      return c.json(toTaskComment(row));
    },
  );
}
