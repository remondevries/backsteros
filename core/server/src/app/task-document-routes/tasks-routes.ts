import {
  DUE_TASKS_LIST_PAGINATED_ONLY_KEYS,
  ListQueryError,
  TASK_LIST_DEFAULT_EXCLUSION_HINT,
  TaskFilterError,
  apiKeyService,
  assertCanSetAgentWorking,
  attachImagesToTaskDescription,
  buildTaskCommentRestPayload,
  buildTaskRestPayload,
  can,
  circleService,
  collectQueryParams,
  commitRestEntityWrite,
  commitRestEntityWriteBatch,
  createTaskSchema,
  db,
  documentService,
  forbidden,
  getAuth,
  idListSchema,
  ignoredLegacyListKeys,
  ignoredLegacyTaskListKeys,
  isOwnerShellAuth,
  isRestLeaderFirstWrite,
  listQueryErrorBody,
  newId,
  notFound,
  parseDueTasksListQuery,
  parseTaskListQuery,
  projectUpdatesService,
  publishTaskLive,
  readIdempotencyKey,
  recordTaskCommentRestSyncEvent,
  recordTaskRestSyncEvent,
  reorderSchema,
  requireScope,
  resolveTaskListFilterRefs,
  resolveTaskWriteRefs,
  routeTaskId,
  taskActivityService,
  taskCommentService,
  taskImageService,
  taskListUsesDefaultStatusExclusion,
  taskProjectService,
  taskWithKey,
  tasksWithKeys,
  toDocument,
  toTaskComment,
  unauthorized,
  updateTaskSchema,
  withIdempotency,
  writeActorForComment,
  writeActorFromAuth,
  z,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Task CRUD, listing, batch/reorder/move/triage and timers. */
export function registerTasksRoutes(app: Hono) {
  app.get("/api/v1/tasks", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const url = new URL(c.req.url);
    const raw: Record<string, string | string[]> = {};
    for (const key of url.searchParams.keys()) {
      const all = url.searchParams.getAll(key);
      raw[key] = all.length <= 1 ? (all[0] ?? "") : all;
    }

    let parsed;
    try {
      parsed = parseTaskListQuery(raw);
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

    if (parsed.mode === "legacy") {
      // OS-45: legacy `{ tasks }` unless paginated=true/cursor. Paginated-only
      // params are ignored here; tell the caller so it can opt in.
      const ignored = ignoredLegacyTaskListKeys(raw);
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      } else if (url.searchParams.size === 0) {
        c.header(
          "X-BacksterOS-Hint",
          "Full task list (all statuses). Prefer GET /tasks?paginated=true&projectId=...&status=... and read items.",
        );
      }
      // OS-58: resolve keys in filters (unknown refs stay unmatched → empty list).
      const resolved = await resolveTaskListFilterRefs(
        auth.workspaceId,
        parsed,
        { strict: false },
      );
      const rows = await taskProjectService.listTasks(auth.workspaceId, {
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
        support:
          c.req.query("support") === undefined
            ? undefined
            : c.req.query("support") === "true",
        notification:
          c.req.query("notification") === undefined
            ? undefined
            : c.req.query("notification") === "true",
      });
      return c.json({ tasks: await tasksWithKeys(auth.workspaceId, rows) });
    }

    try {
      // OS-58: keys allowed; unknown project/assignee/contact/org → 400.
      const resolved = await resolveTaskListFilterRefs(
        auth.workspaceId,
        parsed,
        { strict: true },
      );
      const result = await taskProjectService.listTasksPaginated(
        auth.workspaceId,
        resolved,
      );
      // OS-57: surface the default terminal-status exclusion (also in body).
      if (taskListUsesDefaultStatusExclusion(resolved)) {
        c.header("X-BacksterOS-Hint", TASK_LIST_DEFAULT_EXCLUSION_HINT);
      }
      return c.json(result);
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

  // Static task collection routes must be registered before /tasks/:id.
  app.get("/api/v1/tasks/due", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseDueTasksListQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "paginated") {
      const result = await taskProjectService.listDueTasksPaginated(
        auth.workspaceId,
        parsed,
      );
      return c.json(result);
    }

    const ignored = ignoredLegacyListKeys(raw, DUE_TASKS_LIST_PAGINATED_ONLY_KEYS);
    if (ignored.length && raw.limit == null) {
      c.header(
        "X-BacksterOS-Hint",
        `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
      );
    }
    const rows = await taskProjectService.listDueTasks(
      auth.workspaceId,
      parsed.before,
    );
    const limited = Number.isFinite(parsed.limit)
      ? rows.slice(0, parsed.limit)
      : rows;
    if (Number.isFinite(parsed.limit) && rows.length > parsed.limit) {
      c.header(
        "X-BacksterOS-Hint",
        `Limited to ${parsed.limit} rows. Add paginated=true for { items, nextCursor }.`,
      );
    }
    return c.json({ tasks: await tasksWithKeys(auth.workspaceId, limited) });
  });

  app.get("/api/v1/tasks/inbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const rows = await taskProjectService.listInboxTasks(auth.workspaceId);
    return c.json({ tasks: await tasksWithKeys(auth.workspaceId, rows) });
  });

  app.get("/api/v1/tasks/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const taskId = await routeTaskId(auth.workspaceId, c.req.param("id"));
    if (!taskId) {
      return c.json(notFound("Task"), 404);
    }
    const row = await taskProjectService.getTaskById(
      auth.workspaceId,
      taskId,
    );
    if (!row) {
      return c.json(notFound("Task"), 404);
    }

    const includeRaw = c.req.query("include") ?? "";
    const includes = new Set(
      includeRaw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    );
    let comments:
      | Array<ReturnType<typeof toTaskComment> & { images?: Awaited<ReturnType<typeof taskImageService.listTaskImages>> }>
      | undefined;
    if (includes.has("comments")) {
      const commentRows = await taskCommentService.listTaskComments(
        auth.workspaceId,
        taskId,
        db,
        { limit: 20 },
      );
      const mapped = (commentRows ?? []).map(toTaskComment);
      const byComment = await taskImageService.listTaskImagesForComments(
        auth.workspaceId,
        taskId,
        mapped.map((comment) => comment.id),
      );
      comments = mapped.map((comment) => ({
        ...comment,
        images: byComment.get(comment.id) ?? [],
      }));
    }

    const images = await taskImageService.listTaskImages(
      auth.workspaceId,
      taskId,
      { commentId: null },
    );

    return c.json(
      await taskWithKey(auth.workspaceId, row, {
        ...(comments ? { comments } : {}),
        images: images ?? [],
      }),
    );
  });

  app.get("/api/v1/tasks/:id/documents", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);

    const taskId = await routeTaskId(auth.workspaceId, c.req.param("id"));
    if (!taskId) return c.json(notFound("Task"), 404);
    const rows = await documentService.listDocumentsForTask(
      auth.workspaceId,
      taskId,
    );
    if (rows === null) {
      return c.json(notFound("Task"), 404);
    }
    return c.json({ documents: rows.map(toDocument) });
  });

  app.get("/api/v1/tasks/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskId = await routeTaskId(auth.workspaceId, c.req.param("id"));
    if (!taskId) return c.json(notFound("Task"), 404);
    const result = await circleService.getTaskRelations(auth.workspaceId, taskId);
    return result ? c.json(result) : c.json(notFound("Task"), 404);
  });

  app.get("/api/v1/tasks/:id/project-updates", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth) && !requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const task = await taskProjectService.getTaskById(auth.workspaceId, taskId);
    if (!task) {
      return c.json(notFound("Task"), 404);
    }
    const updates = await projectUpdatesService.listProjectUpdatesForRelatedTask(
      auth.workspaceId,
      taskId,
    );
    return c.json({ updates });
  });

  /** Open task timers across the workspace (latest activity is timer_started). */
  app.get("/api/v1/running-timers", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const timers = await taskActivityService.listOpenRunningTaskTimers(
      auth.workspaceId,
    );
    return c.json({
      timers: timers.map((timer) => ({
        taskId: timer.taskId,
        startedAt: timer.startedAt.toISOString(),
        title: timer.title,
        number: timer.number,
        status: timer.status,
        trackedDurationSeconds: timer.trackedDurationSeconds,
        trackedMinutes: timer.trackedMinutes,
        projectKey: timer.projectKey,
        updatedAt: timer.updatedAt?.toISOString() ?? null,
      })),
    });
  });

  /**
   * Recent task timers (running + paused) for shared chrome dropdowns across
   * OS / DESIGN / DEV. Membership and order are workspace-scoped.
   */
  app.get("/api/v1/recent-timers", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const timers = await taskActivityService.listRecentTaskTimers(
      auth.workspaceId,
    );
    return c.json({
      timers: timers.map((timer) => ({
        taskId: timer.taskId,
        startedAt: timer.startedAt.toISOString(),
        lastTimerAt: timer.lastTimerAt.toISOString(),
        isRunning: timer.isRunning,
        title: timer.title,
        number: timer.number,
        status: timer.status,
        trackedDurationSeconds: timer.trackedDurationSeconds,
        trackedMinutes: timer.trackedMinutes,
        projectKey: timer.projectKey,
        updatedAt: timer.updatedAt?.toISOString() ?? null,
      })),
    });
  });

  app.post(
    "/api/v1/tasks",
    zValidator("json", createTaskSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      const runCreate = async (): Promise<{
        status: number;
        body: unknown;
      }> => {
        try {
          const body = c.req.valid("json");
          const {
            activityActor,
            id: preferredId,
            comment: inlineComment,
            projectKey,
            images: imageUploads,
            ...createFields
          } = body;
          const resolvedRefs = await resolveTaskWriteRefs(auth.workspaceId, {
            projectId: createFields.projectId,
            projectKey,
            contactId: createFields.contactId,
            assigneeId: createFields.assigneeId,
            relatedContactIds: createFields.relatedContactIds,
            relatedOrganizationIds: createFields.relatedOrganizationIds,
            linkedEmailIds: createFields.linkedEmailIds,
          });
          const createInput = {
            ...createFields,
            ...resolvedRefs,
          };
          if (preferredId) {
            const existing = await taskProjectService.getTaskById(
              auth.workspaceId,
              preferredId,
            );
            if (existing) {
              return {
                status: 200,
                body: await taskWithKey(auth.workspaceId, existing),
              };
            }
          }

          const actor = writeActorFromAuth(auth, activityActor);
          let row;
          let commentMapped: ReturnType<typeof toTaskComment> | undefined;

          if (isRestLeaderFirstWrite()) {
            const taskId = preferredId ?? newId();
            const changes: Array<{
              entity: "task" | "task_comment";
              entityId: string;
              operation: "upsert";
              payload: Record<string, unknown>;
            }> = [
              {
                entity: "task",
                entityId: taskId,
                operation: "upsert",
                payload: buildTaskRestPayload(taskId, createInput),
              },
            ];
            let commentId: string | null = null;
            if (inlineComment?.body) {
              commentId = newId();
              const profile = await taskCommentService.resolveWriteActorProfile(
                auth.workspaceId,
                writeActorForComment(auth, { activityActor }),
                db,
              );
              changes.push({
                entity: "task_comment",
                entityId: commentId,
                operation: "upsert",
                payload: buildTaskCommentRestPayload(commentId, taskId, {
                  body: inlineComment.body,
                  authorUserId: profile.userId,
                  authorContactId: profile.contactId,
                  authorEmail: profile.email,
                }),
              });
            }
            if (changes.length === 1) {
              await commitRestEntityWrite({
                workspaceId: auth.workspaceId,
                entity: "task",
                entityId: taskId,
                operation: "upsert",
                payload: changes[0]!.payload,
              });
            } else {
              await commitRestEntityWriteBatch({
                workspaceId: auth.workspaceId,
                changes,
              });
            }
            row = await taskProjectService.getTaskById(
              auth.workspaceId,
              taskId,
            );
            if (!row) {
              throw new Error("TASK_CREATE_FAILED");
            }
            if (commentId) {
              const commentRow = await taskCommentService.getTaskCommentRow(
                auth.workspaceId,
                commentId,
              );
              if (commentRow) commentMapped = toTaskComment(commentRow);
            }
          } else {
            const created = await db.transaction(async (tx) => {
              const taskRow = await taskProjectService.createTask(
                auth.workspaceId,
                createInput,
                preferredId,
                tx,
                actor,
                {
                  authKind:
                    auth.kind === "api_key" || auth.kind === "local_shell"
                      ? auth.kind
                      : undefined,
                },
              );
              let commentRow = null;
              if (inlineComment?.body) {
                commentRow = await taskCommentService.createTaskComment(
                  auth.workspaceId,
                  taskRow.id,
                  { body: inlineComment.body, activityActor },
                  writeActorForComment(auth, { activityActor }),
                  tx,
                );
              }
              return { taskRow, commentRow };
            });
            row = created.taskRow;
            await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
            if (created.commentRow) {
              await recordTaskCommentRestSyncEvent(
                auth.workspaceId,
                created.commentRow,
                "upsert",
              );
              commentMapped = toTaskComment(created.commentRow);
            }
          }

          publishTaskLive(auth, row.id, {
            projectId: row.projectId ?? null,
            operation: "upsert",
          });

          let attachedImages: Awaited<
            ReturnType<typeof taskImageService.listTaskImages>
          > = [];
          if (imageUploads?.length) {
            const attached = await attachImagesToTaskDescription(
              auth.workspaceId,
              row.id,
              imageUploads,
              row.description,
            );
            if (!attached.ok) {
              return {
                status: attached.status,
                body: { error: attached.error, code: "bad_request" },
              };
            }
            attachedImages = attached.images;
            const refreshed = await taskProjectService.getTaskById(
              auth.workspaceId,
              row.id,
            );
            if (refreshed) row = refreshed;
          }

          return {
            status: 201,
            body: await taskWithKey(auth.workspaceId, row, {
              ...(commentMapped ? { comment: commentMapped } : {}),
              images: attachedImages,
            }),
          };
        } catch (error) {
          if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
            return { status: 404, body: notFound("Project") };
          }
          if (
            error instanceof Error &&
            error.message === "WAITING_FOLLOW_UP_REQUIRED"
          ) {
            return {
              status: 400,
              body: {
                error:
                  "followUpDate is required when status is waiting",
                code: "waiting_follow_up_required",
              },
            };
          }
          if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") {
            return {
              status: 400,
              body: {
                error: "Assignee not found",
                code: "assignee_not_found",
              },
            };
          }
          if (
            error instanceof Error &&
            error.message === "RELATED_CONTACT_NOT_FOUND"
          ) {
            return {
              status: 400,
              body: {
                error: "Related contact not found",
                code: "related_contact_not_found",
              },
            };
          }
          if (
            error instanceof Error &&
            error.message === "RELATED_ORGANIZATION_NOT_FOUND"
          ) {
            return {
              status: 400,
              body: {
                error: "Related organization not found",
                code: "related_organization_not_found",
              },
            };
          }
          if (
            error instanceof Error &&
            error.message === "TASK_LABEL_NOT_FOUND"
          ) {
            return {
              status: 400,
              body: { error: "Label not found", code: "task_label_not_found" },
            };
          }
          if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
            return { status: 404, body: notFound("Contact") };
          }
          throw error;
        }
      };

      const idempotencyKey = readIdempotencyKey(
        c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key"),
      );
      const scope =
        auth.apiKeyId != null
          ? `api_key:${auth.apiKeyId}:task`
          : `ws:${auth.workspaceId}:task`;
      const result = idempotencyKey
        ? await withIdempotency(scope, idempotencyKey, runCreate)
        : await runCreate();
      return c.json(result.body, result.status as 200 | 201 | 400 | 404);
    },
  );

  app.patch(
    "/api/v1/tasks/:id",
    zValidator("json", updateTaskSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        const {
          activityActor,
          agentInboxApproved,
          comment: inlineComment,
          projectKey,
          images: imageUploads,
          ...patchFields
        } = body;
        const taskIdRaw = c.req.param("id");
        const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
        if (!taskId) return c.json(notFound("Task"), 404);

        const existingForAgentWorking =
          patchFields.agentWorkingContactId !== undefined ||
          patchFields.agentWorkingLabel !== undefined ||
          patchFields.agentWorkingKind !== undefined ||
          patchFields.status === "in_progress"
            ? await taskProjectService.getTaskById(auth.workspaceId, taskId)
            : null;
        if (
          (patchFields.agentWorkingContactId !== undefined ||
            patchFields.agentWorkingLabel !== undefined ||
            patchFields.agentWorkingKind !== undefined) &&
          !existingForAgentWorking
        ) {
          return c.json(notFound("Task"), 404);
        }

        const canSetAnyAgentWorking =
          isOwnerShellAuth(auth) ||
          (await apiKeyService.apiKeyContactIsWorkspaceOwner(auth));
        if (
          patchFields.agentWorkingContactId !== undefined ||
          patchFields.agentWorkingLabel !== undefined ||
          patchFields.agentWorkingKind !== undefined
        ) {
          assertCanSetAgentWorking({
            canSetAny: canSetAnyAgentWorking,
            authContactId: auth.contactId,
            existingContactId:
              existingForAgentWorking?.agentWorkingContactId ?? null,
            nextContactId: patchFields.agentWorkingContactId,
            touchesLabel: patchFields.agentWorkingLabel !== undefined,
            touchesKind: patchFields.agentWorkingKind !== undefined,
          });
        }

        const imagesOnlyPatch =
          Boolean(imageUploads?.length) &&
          !inlineComment &&
          agentInboxApproved === undefined &&
          Object.keys(patchFields).every(
            (key) => key === "activityActor",
          );

        if (imagesOnlyPatch) {
          const existing = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!existing) return c.json(notFound("Task"), 404);
          const attached = await attachImagesToTaskDescription(
            auth.workspaceId,
            taskId,
            imageUploads!,
            existing.description,
          );
          if (!attached.ok) {
            return c.json(
              { error: attached.error, code: "bad_request" },
              attached.status,
            );
          }
          const refreshed = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          return c.json(
            await taskWithKey(auth.workspaceId, refreshed ?? existing, {
              images: attached.images,
            }),
          );
        }

        const resolvedRefs = await resolveTaskWriteRefs(auth.workspaceId, {
          projectId: patchFields.projectId,
          projectKey,
          contactId: patchFields.contactId,
          assigneeId: patchFields.assigneeId,
          relatedContactIds: patchFields.relatedContactIds,
          relatedOrganizationIds: patchFields.relatedOrganizationIds,
          linkedEmailIds: patchFields.linkedEmailIds,
        });
        // Agent persona keys auto-claim working when they move a task in_progress
        // (OS-96). Owner keys and local shell leave the marker alone unless set.
        const autoClaimWorking =
          patchFields.status === "in_progress" &&
          patchFields.agentWorkingContactId === undefined &&
          auth.kind === "api_key" &&
          Boolean(auth.contactId) &&
          !canSetAnyAgentWorking;
        const patch = {
          ...patchFields,
          ...resolvedRefs,
          ...(autoClaimWorking
            ? {
                agentWorkingContactId: auth.contactId,
                agentWorkingKind: "working" as const,
              }
            : {}),
        };
        const actor = writeActorFromAuth(auth, activityActor);
        let row;
        let commentMapped: ReturnType<typeof toTaskComment> | undefined;

        if (isRestLeaderFirstWrite()) {
          const existing = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!existing) {
            return c.json(notFound("Task"), 404);
          }
          const changes: Array<{
            entity: "task" | "task_comment";
            entityId: string;
            operation: "upsert" | "patch";
            payload: Record<string, unknown>;
          }> = [
            {
              entity: "task",
              entityId: taskId,
              operation: "upsert",
              payload: buildTaskRestPayload(taskId, patch, {
                agentInboxApproved,
                allowAgentInboxApproval: isOwnerShellAuth(auth),
              }),
            },
          ];
          let commentId: string | null = null;
          if (inlineComment?.body) {
            commentId = newId();
            const profile = await taskCommentService.resolveWriteActorProfile(
              auth.workspaceId,
              writeActorForComment(auth, { activityActor }),
              db,
            );
            changes.push({
              entity: "task_comment",
              entityId: commentId,
              operation: "upsert",
              payload: buildTaskCommentRestPayload(commentId, taskId, {
                body: inlineComment.body,
                authorUserId: profile.userId,
                authorContactId: profile.contactId,
                authorEmail: profile.email,
              }),
            });
          }
          if (changes.length === 1) {
            await commitRestEntityWrite({
              workspaceId: auth.workspaceId,
              entity: "task",
              entityId: taskId,
              operation: "upsert",
              payload: changes[0]!.payload,
            });
          } else {
            await commitRestEntityWriteBatch({
              workspaceId: auth.workspaceId,
              changes,
            });
          }
          row = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (commentId) {
            const commentRow = await taskCommentService.getTaskCommentRow(
              auth.workspaceId,
              commentId,
            );
            if (commentRow) commentMapped = toTaskComment(commentRow);
          }
        } else {
          const updated = await db.transaction(async (tx) => {
            const taskRow = await taskProjectService.updateTask(
              auth.workspaceId,
              taskId,
              { ...patch, agentInboxApproved },
              tx,
              actor,
              { allowAgentInboxApproval: isOwnerShellAuth(auth) },
            );
            if (!taskRow) return { taskRow: null, commentRow: null };
            let commentRow = null;
            if (inlineComment?.body) {
              commentRow = await taskCommentService.createTaskComment(
                auth.workspaceId,
                taskId,
                { body: inlineComment.body, activityActor },
                writeActorForComment(auth, { activityActor }),
                tx,
              );
            }
            return { taskRow, commentRow };
          });
          row = updated.taskRow;
          if (!row) {
            return c.json(notFound("Task"), 404);
          }
          await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
          if (updated.commentRow) {
            await recordTaskCommentRestSyncEvent(
              auth.workspaceId,
              updated.commentRow,
              "upsert",
            );
            commentMapped = toTaskComment(updated.commentRow);
          }
        }

        if (row) {
          publishTaskLive(auth, row.id, {
            projectId: row.projectId ?? null,
            operation: "upsert",
          });
        }

        let attachedImages:
          | Awaited<ReturnType<typeof taskImageService.listTaskImages>>
          | undefined;
        if (row && imageUploads?.length) {
          const attached = await attachImagesToTaskDescription(
            auth.workspaceId,
            row.id,
            imageUploads,
            row.description,
          );
          if (!attached.ok) {
            return c.json(
              { error: attached.error, code: "bad_request" },
              attached.status,
            );
          }
          attachedImages = attached.images;
          const refreshed = await taskProjectService.getTaskById(
            auth.workspaceId,
            row.id,
          );
          if (refreshed) row = refreshed;
        } else if (row) {
          attachedImages =
            (await taskImageService.listTaskImages(auth.workspaceId, row.id, {
              commentId: null,
            })) ?? [];
        }

        return c.json(
          await taskWithKey(auth.workspaceId, row!, {
            ...(commentMapped ? { comment: commentMapped } : {}),
            ...(attachedImages ? { images: attachedImages } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") {
          return c.json(
            { error: "Assignee not found", code: "assignee_not_found" },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "RELATED_CONTACT_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Related contact not found",
              code: "related_contact_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "RELATED_ORGANIZATION_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Related organization not found",
              code: "related_organization_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "TASK_LABEL_NOT_FOUND"
        ) {
          return c.json(
            { error: "Label not found", code: "task_label_not_found" },
            400,
          );
        }
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        if (
          error instanceof Error &&
          error.message === "AGENT_WORKING_CONTACT_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Agent working contact not found",
              code: "agent_working_contact_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "AGENT_WORKING_FORBIDDEN"
        ) {
          return c.json(
            {
              error:
                "Agents may only set or clear their own working marker",
              code: "agent_working_forbidden",
            },
            403,
          );
        }
        if (
          error instanceof Error &&
          error.message === "EXECUTION_LOCATION_LOCKED"
        ) {
          return c.json(
            {
              error:
                "Execution location is frozen once the coding thread starts",
              code: "execution_location_locked",
            },
            409,
          );
        }
        if (
          error instanceof Error &&
          error.message === "WAITING_FOLLOW_UP_REQUIRED"
        ) {
          return c.json(
            {
              error:
                "followUpDate is required when status is waiting (and cannot be cleared while waiting)",
              code: "waiting_follow_up_required",
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/tasks/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getTaskById(
        auth.workspaceId,
        taskId,
      );
      if (!existing) {
        return c.json(notFound("Task"), 404);
      }
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task",
        entityId: taskId,
        operation: "delete",
        payload: { id: taskId },
      });
      publishTaskLive(auth, taskId, {
        projectId: existing.projectId ?? null,
        operation: "delete",
      });
      return c.body(null, 204);
    }
    const row = await taskProjectService.deleteTask(
      auth.workspaceId,
      taskId,
    );
    if (!row) {
      return c.json(notFound("Task"), 404);
    }
    await recordTaskRestSyncEvent(auth.workspaceId, row, "delete");
    publishTaskLive(auth, row.id, {
      projectId: row.projectId ?? null,
      operation: "delete",
    });
    return c.body(null, 204);
  });

  app.post("/api/v1/tasks/batch", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const body = await c.req.json();
    const ids = idListSchema.safeParse(body);
    const patchParsed = updateTaskSchema.safeParse(body.patch);
    if (!ids.success || !patchParsed.success) {
      return c.json({ error: "Invalid batch update", code: "bad_request" }, 400);
    }

    const {
      activityActor: _activityActor,
      agentInboxApproved,
      comment: _comment,
      projectKey,
      ...patchFields
    } = patchParsed.data;
    // Inline comments are not supported on batch — use PATCH /tasks/:id.
    void _comment;
    void _activityActor;

    let resolvedPatch;
    try {
      const resolvedRefs = await resolveTaskWriteRefs(auth.workspaceId, {
        projectId: patchFields.projectId,
        projectKey,
        contactId: patchFields.contactId,
        assigneeId: patchFields.assigneeId,
        relatedContactIds: patchFields.relatedContactIds,
        relatedOrganizationIds: patchFields.relatedOrganizationIds,
        linkedEmailIds: patchFields.linkedEmailIds,
      });
      resolvedPatch = {
        ...patchFields,
        ...resolvedRefs,
        ...(agentInboxApproved !== undefined ? { agentInboxApproved } : {}),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
        return c.json(notFound("Project"), 404);
      }
      if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") {
        return c.json(
          { error: "Assignee not found", code: "assignee_not_found" },
          400,
        );
      }
      if (
        error instanceof Error &&
        error.message === "RELATED_CONTACT_NOT_FOUND"
      ) {
        return c.json(
          {
            error: "Related contact not found",
            code: "related_contact_not_found",
          },
          400,
        );
      }
      if (
        error instanceof Error &&
        error.message === "RELATED_ORGANIZATION_NOT_FOUND"
      ) {
        return c.json(
          {
            error: "Related organization not found",
            code: "related_organization_not_found",
          },
          400,
        );
      }
      if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
        return c.json(notFound("Contact"), 404);
      }
      throw error;
    }

    const results: Array<
      | {
          ok: true;
          id: string;
          ref: string;
          task: Awaited<ReturnType<typeof taskWithKey>>;
        }
      | {
          ok: false;
          id: string | null;
          ref: string;
          error: string;
          code: "not_found";
        }
    > = [];
    const resolvedIds: string[] = [];
    const refById = new Map<string, string>();

    for (const ref of ids.data.ids) {
      const taskId = await routeTaskId(auth.workspaceId, ref);
      if (!taskId) {
        results.push({
          ok: false,
          id: null,
          ref,
          error: "Task not found",
          code: "not_found",
        });
        continue;
      }
      const existing = await taskProjectService.getTaskById(
        auth.workspaceId,
        taskId,
      );
      if (!existing) {
        results.push({
          ok: false,
          id: taskId,
          ref,
          error: "Task not found",
          code: "not_found",
        });
        continue;
      }
      resolvedIds.push(taskId);
      refById.set(taskId, ref);
    }

    const updatedRows = await (async () => {
      if (resolvedIds.length === 0) return [];
      if (isRestLeaderFirstWrite()) {
        // Use patch so unknown ids never invent rows (OS-64).
        await commitRestEntityWriteBatch({
          workspaceId: auth.workspaceId,
          changes: resolvedIds.map((id) => ({
            entity: "task" as const,
            entityId: id,
            operation: "patch" as const,
            payload: buildTaskRestPayload(id, resolvedPatch),
          })),
        });
        const loaded = await Promise.all(
          resolvedIds.map((id) =>
            taskProjectService.getTaskById(auth.workspaceId, id),
          ),
        );
        return loaded.filter(
          (row): row is NonNullable<typeof row> => row != null,
        );
      }
      return taskProjectService.batchUpdateTasks(
        auth.workspaceId,
        resolvedIds,
        resolvedPatch,
        writeActorFromAuth(auth),
      );
    })();

    if (!isRestLeaderFirstWrite()) {
      for (const row of updatedRows) {
        await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
      }
    }
    for (const row of updatedRows) {
      publishTaskLive(auth, row.id, {
        projectId: row.projectId ?? null,
        operation: "upsert",
      });
    }

    const tasksOut = await tasksWithKeys(auth.workspaceId, updatedRows);
    const taskById = new Map(tasksOut.map((task) => [task.id, task]));
    for (const id of resolvedIds) {
      const task = taskById.get(id);
      const ref = refById.get(id) ?? id;
      if (task) {
        results.push({ ok: true, id, ref, task });
      } else {
        results.push({
          ok: false,
          id,
          ref,
          error: "Task not found",
          code: "not_found",
        });
      }
    }

    return c.json({ tasks: tasksOut, results });
  });

  app.post(
    "/api/v1/tasks/reorder",
    zValidator("json", reorderSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const orderedIds = c.req.valid("json").orderedIds;
      const rows = await (async () => {
        if (isRestLeaderFirstWrite()) {
          await commitRestEntityWriteBatch({
            workspaceId: auth.workspaceId,
            changes: orderedIds.map((id, index) => ({
              entity: "task" as const,
              entityId: id,
              operation: "upsert" as const,
              payload: buildTaskRestPayload(id, { sortOrder: index }),
            })),
          });
          const loaded = await Promise.all(
            orderedIds.map((id) =>
              taskProjectService.getTaskById(auth.workspaceId, id),
            ),
          );
          return loaded.filter((row): row is NonNullable<typeof row> => row != null);
        }
        return taskProjectService.reorderTasks(auth.workspaceId, orderedIds);
      })();
      if (!isRestLeaderFirstWrite()) {
        for (const row of rows) {
          await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
        }
      }
      for (const row of rows) {
        publishTaskLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
      }
      return c.json({ tasks: await tasksWithKeys(auth.workspaceId, rows) });
    },
  );

  app.post("/api/v1/tasks/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const parsed = z.object({ projectId: z.string().nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid projectId", code: "bad_request" }, 400);
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      if (!existing) return c.json(notFound("Task"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task",
        entityId: taskId,
        operation: "upsert",
        payload: buildTaskRestPayload(taskId, {
          projectId: parsed.data.projectId,
          inbox: parsed.data.projectId === null,
        }),
      });
      const row = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      if (row) {
        publishTaskLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
      }
      return c.json(await taskWithKey(auth.workspaceId, row!));
    }
    const row = await taskProjectService.updateTask(
      auth.workspaceId,
      taskId,
      { projectId: parsed.data.projectId, inbox: parsed.data.projectId === null },
      undefined,
      writeActorFromAuth(auth),
    );
    if (!row) return c.json(notFound("Task"), 404);
    await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
    publishTaskLive(auth, row.id, {
      projectId: row.projectId ?? null,
      operation: "upsert",
    });
    return c.json(await taskWithKey(auth.workspaceId, row));
  });

  app.post("/api/v1/tasks/:id/triage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z
      .object({ projectId: z.string().nullable().optional(), status: z.string().optional() })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid triage data", code: "bad_request" }, 400);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      if (!existing) return c.json(notFound("Task"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task",
        entityId: taskId,
        operation: "upsert",
        payload: buildTaskRestPayload(taskId, {
          projectId: parsed.data.projectId,
          status: parsed.data.status,
          triagedAt: new Date().toISOString(),
          inbox: false,
        }),
      });
      const row = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      if (row) {
        publishTaskLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
      }
      return c.json(await taskWithKey(auth.workspaceId, row!));
    }
    const row = await taskProjectService.updateTask(
      auth.workspaceId,
      taskId,
      {
        projectId: parsed.data.projectId,
        status: parsed.data.status as never,
        triagedAt: new Date().toISOString(),
        inbox: false,
      },
      undefined,
      writeActorFromAuth(auth),
    );
    if (!row) return c.json(notFound("Task"), 404);
    await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
    publishTaskLive(auth, row.id, {
      projectId: row.projectId ?? null,
      operation: "upsert",
    });
    return c.json(await taskWithKey(auth.workspaceId, row));
  });
}
