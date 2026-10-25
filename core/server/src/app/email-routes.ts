/**
 * email-routes routes (OS-73 split from routes.ts).
 */
import {
  AgentMailApiError,
  EMAIL_MESSAGES_LIST_PAGINATED_ONLY_KEYS,
  ListQueryError,
  agentmailSettingsService,
  buildEmailThreadCommentRestPayload,
  buildEmailThreadRestPayload,
  can,
  collectQueryParams,
  commitRestEntityWrite,
  createEmailThreadCommentSchema,
  emailAgentDraftInputSchema,
  emailComposeDraftInputSchema,
  emailConceptReplyInputSchema,
  emailThreadsService,
  forbidden,
  getAuth,
  handleAgentMailWebhookDelivery,
  ignoredLegacyListKeys,
  isRestLeaderFirstWrite,
  listQueryErrorBody,
  newId,
  paginateByUpdatedAtId,
  parseEmailMessagesListQuery,
  recordEmailThreadCommentRestSyncEvent,
  recordEmailThreadRestSyncEvent,
  requireScope,
  streamSSE,
  subscribeEmailUpdated,
  subscribeWorkspaceUpdated,
  svixHeadersFromRequest,
  unauthorized,
  updateAgentMailDraftSchema,
  updateEmailThreadCommentSchema,
  updateEmailThreadMetadataSchema,
  zValidator,
} from "./route-deps.js";
import type {
  Hono,
} from "./route-deps.js";

export function registerEmailRoutes(app: Hono) {
  app.get("/api/v1/email/messages", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseEmailMessagesListQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }
    try {
      let messages = await agentmailSettingsService.listAgentMailMessages(
        auth.workspaceId,
      );
      if (parsed.statuses.length) {
        messages = messages.filter((message) =>
          parsed.statuses.includes(message.status ?? "backlog"),
        );
      }
      if (parsed.updatedSince) {
        const since = parsed.updatedSince.getTime();
        messages = messages.filter(
          (message) => (Date.parse(message.timestamp) || 0) >= since,
        );
      }

      if (parsed.mode === "legacy") {
        const ignored = ignoredLegacyListKeys(
          raw,
          EMAIL_MESSAGES_LIST_PAGINATED_ONLY_KEYS,
        );
        if (ignored.length) {
          c.header(
            "X-BacksterOS-Hint",
            `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
          );
        }
        return c.json({ messages });
      }

      // Map timestamp → updatedAt for shared keyset helper.
      const keyed = messages.map((message) => ({
        ...message,
        id: message.messageId,
        updatedAt: message.timestamp,
      }));
      const page = paginateByUpdatedAtId(keyed, {
        limit: parsed.limit,
        cursor: parsed.cursor,
      });
      return c.json({
        items: page.items.map(({ id: _id, updatedAt: _u, ...message }) => message),
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list AgentMail messages";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });

  app.get("/api/v1/email/events", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 16;
      const unsubscribe = subscribeEmailUpdated(workspaceId, (event) => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        void stream
          .writeSSE({
            event: "email.updated",
            data: JSON.stringify({
              inboxId: event.inboxId,
              messageId: event.messageId,
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

  /** Live entity hints for open shells (agent document writes → Tier D refetch). */
  app.get("/api/v1/workspace/events", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      /** Drop events when the client is slow — unbounded writeSSE filled TCP
       *  buffers (~1MB+) and, with HTTP/1.1's 6-conn limit, starved REST. */
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 16;
      const unsubscribe = subscribeWorkspaceUpdated(workspaceId, (event) => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        void stream
          .writeSSE({
            event: "workspace.updated",
            data: JSON.stringify({
              kind: event.kind,
              entityId: event.entityId,
              projectId: event.projectId ?? null,
              reason: event.reason ?? null,
              contentVersion: event.contentVersion ?? null,
              operation: event.operation ?? "upsert",
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

  app.post("/api/v1/webhooks/agentmail", async (c) => {
    const rawBody = await c.req.text();
    const headers = svixHeadersFromRequest((name) => c.req.header(name));
    const secrets = await agentmailSettingsService.listAgentMailWebhookSecrets();
    const result = handleAgentMailWebhookDelivery({
      rawBody,
      headers,
      secrets,
      deliveryId: headers["svix-id"] ?? null,
    });
    if (!result.ok) {
      return c.body(null, 400);
    }
    return c.body(null, 204);
  });

  app.get(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.getAgentMailMessage(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load AgentMail message";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.get(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/attachments/:attachmentId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      const attachmentId = decodeURIComponent(c.req.param("attachmentId"));
      try {
        const result = await agentmailSettingsService.getAgentMailMessageAttachment(
          auth.workspaceId,
          inboxId,
          messageId,
          attachmentId,
        );
        c.header("Content-Type", result.contentType);
        if (result.filename) {
          c.header(
            "Content-Disposition",
            `inline; filename="${result.filename.replaceAll('"', "")}"`,
          );
        }
        return c.body(Uint8Array.from(result.bytes).buffer);
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load AgentMail attachment";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.delete(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      const scope = c.req.query("scope");
      try {
        if (scope === "message") {
          return c.json(
            await agentmailSettingsService.deleteAgentMailThreadMessage(
              auth.workspaceId,
              inboxId,
              messageId,
            ),
          );
        }
        return c.json(
          await agentmailSettingsService.deleteAgentMailMessage(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not delete AgentMail conversation";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/report-spam",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.reportAgentMailMessageSpam(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not report AgentMail message as spam";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.get(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/source",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.getAgentMailMessageSource(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load AgentMail message source";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/mark-unread",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.markAgentMailMessageUnread(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not mark AgentMail message unread";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/mark-read",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.markAgentMailMessageRead(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not mark AgentMail message read";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/email/inboxes/:inboxId/drafts/:draftId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const inboxId = decodeURIComponent(c.req.param("inboxId"));
    const draftId = decodeURIComponent(c.req.param("draftId"));
    try {
      return c.json(
        await agentmailSettingsService.getAgentMailDraft(
          auth.workspaceId,
          inboxId,
          draftId,
        ),
      );
    } catch (error) {
      if (error instanceof AgentMailApiError && error.status === 404) {
        return c.json({ error: error.message, code: "not_found" }, 404);
      }
      const message =
        error instanceof Error ? error.message : "Could not load AgentMail draft";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/concept-reply",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = emailConceptReplyInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: parsed.error.message, code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await agentmailSettingsService.upsertEmailConceptReply(
            auth.workspaceId,
            inboxId,
            messageId,
            parsed.data,
          ),
        );
      } catch (error) {
        console.error("[email] concept-reply failed:", {
          inboxId,
          messageId,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  status: (error as { status?: number }).status,
                }
              : error,
        });
        if (error instanceof AgentMailApiError) {
          const status =
            error.status >= 400 && error.status < 500 ? error.status : 400;
          return c.json(
            {
              error: error.message,
              code: status === 404 ? "not_found" : "bad_request",
            },
            status as 400 | 404 | 422,
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not save reply concept";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/agent-draft",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = emailAgentDraftInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: parsed.error.message, code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await agentmailSettingsService.startEmailAgentDraft(
            auth.workspaceId,
            inboxId,
            messageId,
            parsed.data.prompt,
            parsed.data.intent,
            parsed.data.currentDraftBody,
          ),
        );
      } catch (error) {
        console.error("[email] agent-draft failed:", {
          inboxId,
          messageId,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  status: (error as { status?: number }).status,
                }
              : error,
        });
        if (error instanceof AgentMailApiError) {
          return c.json(
            {
              error: error.message,
              code: error.status === 404 ? "not_found" : "bad_request",
            },
            error.status === 404 ? 404 : 400,
          );
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not start email agent draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/compose-draft",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = emailComposeDraftInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: parsed.error.message, code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await agentmailSettingsService.upsertEmailComposeDraft(
            auth.workspaceId,
            inboxId,
            parsed.data,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError) {
          return c.json(
            {
              error: error.message,
              code: error.status === 404 ? "not_found" : "bad_request",
            },
            error.status === 404 ? 404 : 400,
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not save compose draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/drafts/:draftId/send",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const draftId = decodeURIComponent(c.req.param("draftId"));
      try {
        return c.json(
          await agentmailSettingsService.sendAgentMailDraft(
            auth.workspaceId,
            inboxId,
            draftId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError) {
          return c.json(
            {
              error: error.message,
              code: error.status === 404 ? "not_found" : "bad_request",
            },
            error.status === 404 ? 404 : 400,
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not send draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.delete("/api/v1/email/inboxes/:inboxId/drafts/:draftId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const inboxId = decodeURIComponent(c.req.param("inboxId"));
    const draftId = decodeURIComponent(c.req.param("draftId"));
    try {
      return c.json(
        await agentmailSettingsService.deleteAgentMailDraft(
          auth.workspaceId,
          inboxId,
          draftId,
        ),
      );
    } catch (error) {
      if (error instanceof AgentMailApiError) {
        return c.json(
          {
            error: error.message,
            code: error.status === 404 ? "not_found" : "bad_request",
          },
          error.status === 404 ? 404 : 400,
        );
      }
      const message =
        error instanceof Error ? error.message : "Could not delete draft";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.patch(
    "/api/v1/email/inboxes/:inboxId/drafts/:draftId",
    zValidator("json", updateAgentMailDraftSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const draftId = decodeURIComponent(c.req.param("draftId"));
      try {
        return c.json(
          await agentmailSettingsService.updateAgentMailDraft(
            auth.workspaceId,
            inboxId,
            draftId,
            c.req.valid("json"),
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error ? error.message : "Could not update draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/email/threads/by-display-id/:displayId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read") && !can(auth, "settings:write")) {
      return c.json(forbidden(), 403);
    }
    const displayId = decodeURIComponent(c.req.param("displayId"));
    const metadata = await emailThreadsService.getEmailThreadByDisplayId(
      auth.workspaceId,
      displayId,
    );
    if (!metadata) {
      return c.json({ error: "Email thread not found", code: "not_found" }, 404);
    }
    return c.json(metadata);
  });
  app.patch(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/metadata",
    zValidator("json", updateEmailThreadMetadataSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const patch = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const existing = await emailThreadsService.getEmailThreadByInboxKey(
            auth.workspaceId,
            inboxId,
            threadKey,
          );
          const threadId = existing?.id ?? newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "email_thread",
            entityId: threadId,
            operation: "upsert",
            payload: buildEmailThreadRestPayload(
              threadId,
              inboxId,
              threadKey,
              patch,
            ),
          });
          const row = await emailThreadsService.getEmailThreadById(
            auth.workspaceId,
            threadId,
          );
          if (!row) {
            return c.json({ error: "Thread not found", code: "not_found" }, 404);
          }
          if (patch.status) {
            void agentmailSettingsService.syncAgentMailEmailStatusLabel(
              auth.workspaceId,
              inboxId,
              threadKey,
              patch.status,
            );
          }
          return c.json(
            await emailThreadsService.toEmailThreadMetadata(
              auth.workspaceId,
              row,
            ),
          );
        }
        const row = await emailThreadsService.updateEmailThreadMetadata(
          auth.workspaceId,
          inboxId,
          threadKey,
          patch,
        );
        if (!row) {
          return c.json({ error: "Thread not found", code: "not_found" }, 404);
        }
        const dbRow = await emailThreadsService.getEmailThreadById(
          auth.workspaceId,
          row.id,
        );
        if (dbRow) {
          await recordEmailThreadRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
        }
        if (patch.status) {
          void agentmailSettingsService.syncAgentMailEmailStatusLabel(
            auth.workspaceId,
            inboxId,
            threadKey,
            patch.status,
          );
        }
        return c.json(row);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not update email thread metadata";
        const code =
          message.endsWith("_NOT_FOUND") ? "not_found" : "bad_request";
        return c.json({ error: message, code }, code === "not_found" ? 404 : 400);
      }
    },
  );
  app.get(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read") && !can(auth, "settings:write")) {
        return c.json(forbidden(), 403);
      }
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const comments = await emailThreadsService.listEmailThreadComments(
        auth.workspaceId,
        inboxId,
        threadKey,
      );
      return c.json({ comments });
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments",
    zValidator("json", createEmailThreadCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const input = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const commentId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "email_thread_comment",
          entityId: commentId,
          operation: "upsert",
          payload: buildEmailThreadCommentRestPayload(
            commentId,
            inboxId,
            threadKey,
            { body: input.body, author: input.author },
          ),
        });
        const row = await emailThreadsService.getEmailThreadCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!row) {
          return c.json(
            { error: "Comment create failed", code: "internal" },
            500,
          );
        }
        return c.json(
          {
            id: row.id,
            emailThreadId: row.emailThreadId,
            body: row.body ?? "",
            author: row.author === "agent" ? "agent" : "user",
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          },
          201,
        );
      }
      const comment = await emailThreadsService.createEmailThreadComment(
        auth.workspaceId,
        inboxId,
        threadKey,
        { body: input.body, author: input.author },
      );
      const dbRow = await emailThreadsService.getEmailThreadCommentRow(
        auth.workspaceId,
        comment.id,
      );
      if (dbRow) {
        await recordEmailThreadCommentRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "upsert",
        );
      }
      return c.json(comment, 201);
    },
  );
  app.patch(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments/:commentId",
    zValidator("json", updateEmailThreadCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const commentId = decodeURIComponent(c.req.param("commentId"));
      const body = c.req.valid("json").body;
      if (isRestLeaderFirstWrite()) {
        const existing = await emailThreadsService.getEmailThreadCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!existing || existing.deletedAt) {
          return c.json({ error: "Comment not found", code: "not_found" }, 404);
        }
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "email_thread_comment",
          entityId: commentId,
          operation: "upsert",
          payload: buildEmailThreadCommentRestPayload(
            commentId,
            inboxId,
            threadKey,
            { body },
          ),
        });
        const row = await emailThreadsService.getEmailThreadCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!row || row.deletedAt) {
          return c.json({ error: "Comment not found", code: "not_found" }, 404);
        }
        return c.json({
          id: row.id,
          emailThreadId: row.emailThreadId,
          body: row.body ?? "",
          author: row.author === "agent" ? "agent" : "user",
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
      const comment = await emailThreadsService.updateEmailThreadComment(
        auth.workspaceId,
        commentId,
        body,
      );
      if (!comment) {
        return c.json({ error: "Comment not found", code: "not_found" }, 404);
      }
      const dbRow = await emailThreadsService.getEmailThreadCommentRow(
        auth.workspaceId,
        commentId,
      );
      if (dbRow) {
        await recordEmailThreadCommentRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "upsert",
        );
      }
      return c.json(comment);
    },
  );
  app.delete(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments/:commentId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const commentId = decodeURIComponent(c.req.param("commentId"));
      const existing = await emailThreadsService.getEmailThreadCommentRow(
        auth.workspaceId,
        commentId,
      );
      if (!existing || existing.deletedAt) {
        return c.json({ error: "Comment not found", code: "not_found" }, 404);
      }
      if (isRestLeaderFirstWrite()) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "email_thread_comment",
          entityId: commentId,
          operation: "delete",
          payload: buildEmailThreadCommentRestPayload(
            commentId,
            inboxId,
            threadKey,
            {},
          ),
        });
        return c.json({ ok: true });
      }
      const deleted = await emailThreadsService.deleteEmailThreadComment(
        auth.workspaceId,
        commentId,
      );
      if (!deleted) {
        return c.json({ error: "Comment not found", code: "not_found" }, 404);
      }
      const dbRow = await emailThreadsService.getEmailThreadCommentRow(
        auth.workspaceId,
        commentId,
      );
      if (dbRow) {
        await recordEmailThreadCommentRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "delete",
        );
      }
      return c.json({ ok: true });
    },
  );
}
