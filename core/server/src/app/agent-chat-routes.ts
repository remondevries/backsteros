/**
 * Shell chat threads (OS-150) — Remon sends; agent API key replies.
 */
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  answerChatThreadMessageInputSchema,
  createChatThreadMessageInputSchema,
  deleteChatThreadMessagesInputSchema,
  getOrCreateChatThreadInputSchema,
  updateChatThreadAgentStatusInputSchema,
  updateChatThreadMessageInputSchema,
} from "@backsteros/contracts";

import * as agentChat from "../services/agent-chat.js";
import * as chatAttachments from "../services/chat-attachments.js";
import {
  AGENT_SHELL_CHAT_SSE_EVENT,
  AGENT_SHELL_CHAT_STATUS_SSE_EVENT,
  subscribeAgentShellChatMessage,
  subscribeAgentShellChatStatus,
} from "../lib/agent-shell-chat-events.js";
import { MAX_CHAT_ATTACHMENT_BYTES } from "../lib/chat-attachment-content-type.js";
import {
  can,
  forbidden,
  getAuth,
  isAgentPersonaAuth,
  notFound,
} from "./route-helpers.js";

function canReadChat(auth: ReturnType<typeof getAuth>): boolean {
  return (
    can(auth, "chat:read") ||
    can(auth, "chat:write") ||
    can(auth, "settings:read")
  );
}

/** Owner / Access door keys only — never agent persona keys. */
function canSubscribeShellChatEvents(
  auth: ReturnType<typeof getAuth>,
): boolean {
  if (isAgentPersonaAuth(auth)) return false;
  return canReadChat(auth);
}

function canWriteUserMessage(auth: ReturnType<typeof getAuth>): boolean {
  if (isAgentPersonaAuth(auth)) return false;
  return can(auth, "chat:write") || can(auth, "settings:write");
}

function canWriteAgentReply(auth: ReturnType<typeof getAuth>): boolean {
  return isAgentPersonaAuth(auth) && Boolean(auth.apiKeyId);
}

function errorStatus(error: unknown): 400 | 403 | 404 | 409 {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    if (status === 404) return 404;
    if (status === 403) return 403;
    if (status === 409) return 409;
  }
  return 400;
}

function errorCode(status: 400 | 403 | 404 | 409): string {
  if (status === 404) return "not_found";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  return "bad_request";
}

export function registerAgentChatRoutes(app: Hono) {
  /**
   * Live shell DM hints for the desktop sidebar (owner SSE via agents door).
   * Agents posting replies cannot subscribe.
   */
  app.get("/api/v1/chat/threads/events", async (c) => {
    const auth = getAuth(c);
    if (!canSubscribeShellChatEvents(auth)) return c.json(forbidden(), 403);
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 16;
      const writeEvent = (event: string, data: unknown) => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        void stream
          .writeSSE({
            event,
            data: JSON.stringify(data),
          })
          .catch(() => {
            closed = true;
            unsubscribeMessage();
            unsubscribeStatus();
          })
          .finally(() => {
            pendingWrites = Math.max(0, pendingWrites - 1);
          });
      };
      const unsubscribeMessage = subscribeAgentShellChatMessage(
        workspaceId,
        (event) => {
          writeEvent(AGENT_SHELL_CHAT_SSE_EVENT, {
            threadId: event.threadId,
            agentId: event.agentId,
            message: event.message,
          });
        },
      );
      const unsubscribeStatus = subscribeAgentShellChatStatus(
        workspaceId,
        (event) => {
          writeEvent(AGENT_SHELL_CHAT_STATUS_SSE_EVENT, {
            threadId: event.threadId,
            agentId: event.agentId,
            state: event.state,
            at: event.at,
            pendingReplyAt: event.pendingReplyAt,
            label: event.label,
          });
        },
      );
      stream.onAbort(() => {
        closed = true;
        unsubscribeMessage();
        unsubscribeStatus();
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
      unsubscribeMessage();
      unsubscribeStatus();
    });
  });

  app.get("/api/v1/chat/threads", async (c) => {
    const auth = getAuth(c);
    if (!canReadChat(auth)) return c.json(forbidden(), 403);
    const agentId = c.req.query("agentId")?.trim() || undefined;
    const threads = await agentChat.listChatThreads(auth.workspaceId, agentId);
    return c.json({ threads });
  });

  app.post("/api/v1/chat/threads", async (c) => {
    const auth = getAuth(c);
    if (!canWriteUserMessage(auth) && !canReadChat(auth)) {
      return c.json(forbidden(), 403);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = getOrCreateChatThreadInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid thread payload", code: "bad_request" },
        400,
      );
    }
    try {
      const thread = await agentChat.getOrCreateChatThread(
        auth.workspaceId,
        parsed.data.agentId,
      );
      return c.json(thread);
    } catch (error) {
      const status = errorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not open thread";
      return c.json({ error: message, code: errorCode(status) }, status);
    }
  });

  app.get("/api/v1/chat/threads/:threadId", async (c) => {
    const auth = getAuth(c);
    if (!canReadChat(auth)) return c.json(forbidden(), 403);
    const thread = await agentChat.getChatThreadWithMessages(
      auth.workspaceId,
      c.req.param("threadId"),
    );
    if (!thread) return c.json(notFound("Thread"), 404);
    return c.json(thread);
  });

  app.get("/api/v1/chat/threads/:threadId/messages", async (c) => {
    const auth = getAuth(c);
    if (!canReadChat(auth)) return c.json(forbidden(), 403);
    const messages = await agentChat.listChatThreadMessages(
      auth.workspaceId,
      c.req.param("threadId"),
    );
    if (!messages) return c.json(notFound("Thread"), 404);
    return c.json({ messages });
  });

  app.post("/api/v1/chat/threads/:threadId/messages", async (c) => {
    const auth = getAuth(c);
    const asAgent = canWriteAgentReply(auth);
    const asUser = canWriteUserMessage(auth);
    if (!asAgent && !asUser) return c.json(forbidden(), 403);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = createChatThreadMessageInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid message payload", code: "bad_request" },
        400,
      );
    }

    try {
      const result = await agentChat.postChatThreadMessage(
        auth.workspaceId,
        c.req.param("threadId"),
        parsed.data.body,
        {
          apiKeyId: asAgent ? (auth.apiKeyId ?? null) : null,
          authorContactId: auth.contactId ?? null,
          authorName: asAgent ? null : "Remon",
        },
        undefined,
        {
          choices: parsed.data.choices,
          approval: parsed.data.approval,
          form: parsed.data.form,
          progress: parsed.data.progress,
          attachmentIds: parsed.data.attachmentIds,
          skipLinkPreviews: parsed.data.skipLinkPreviews,
        },
      );
      return c.json(result, 201);
    } catch (error) {
      const status = errorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not post message";
      return c.json({ error: message, code: errorCode(status) }, status);
    }
  });

  /**
   * Upload a chat attachment (raw body + X-Filename). Link via `attachmentIds`
   * on the subsequent message POST. Owner or the agent for this thread.
   */
  app.post("/api/v1/chat/threads/:threadId/attachments", async (c) => {
    const auth = getAuth(c);
    const asAgent = canWriteAgentReply(auth);
    const asUser = canWriteUserMessage(auth);
    if (!asAgent && !asUser) return c.json(forbidden(), 403);

    const threadId = c.req.param("threadId");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
      return c.json(
        {
          error: "Attachment must be between 1 byte and 25 MB",
          code: "bad_request",
        },
        400,
      );
    }
    const filename = (c.req.header("X-Filename") ?? "").trim();
    if (!filename) {
      return c.json(
        { error: "X-Filename is required", code: "bad_request" },
        400,
      );
    }

    try {
      const attachment = await chatAttachments.uploadChatThreadAttachment(
        auth.workspaceId,
        threadId,
        bytes,
        filename,
        c.req.header("Content-Type"),
      );
      return c.json(attachment, 201);
    } catch (error) {
      const status = errorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not upload attachment";
      return c.json({ error: message, code: errorCode(status) }, status);
    }
  });

  app.get(
    "/api/v1/chat/threads/:threadId/attachments/:attachmentId",
    async (c) => {
      const auth = getAuth(c);
      if (!canReadChat(auth) && !canWriteAgentReply(auth)) {
        return c.json(forbidden(), 403);
      }
      const result = await chatAttachments.getChatThreadAttachmentBytes(
        auth.workspaceId,
        c.req.param("threadId"),
        c.req.param("attachmentId"),
      );
      if (!result) return c.json(notFound("Attachment"), 404);
      const { row, bytes } = result;
      const disposition =
        row.kind === "image" || row.kind === "pdf" ? "inline" : "attachment";
      const safeName = row.originalFilename.replace(/[^\w.\- ()[\]]+/g, "_");
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: {
          "content-type": row.contentType || "application/octet-stream",
          "content-length": String(bytes.byteLength),
          "content-disposition": `${disposition}; filename="${safeName}"`,
          "x-content-type-options": "nosniff",
          "cache-control": "private, max-age=3600",
        },
      });
    },
  );

  /**
   * Answer assistant choices, approval, or form once — owner / Access keys only.
   * Records the answer and posts a normal user message (webhook path unchanged).
   */
  app.post(
    "/api/v1/chat/threads/:threadId/messages/:messageId/answer",
    async (c) => {
      const auth = getAuth(c);
      if (!canWriteUserMessage(auth)) return c.json(forbidden(), 403);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = answerChatThreadMessageInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: "Invalid answer payload", code: "bad_request" },
          400,
        );
      }
      const postAuth = {
        apiKeyId: null as string | null,
        authorContactId: auth.contactId ?? null,
        authorName: "Remon",
      };
      try {
        if ("decision" in parsed.data) {
          const result = await agentChat.answerChatThreadMessageApproval(
            auth.workspaceId,
            c.req.param("threadId"),
            c.req.param("messageId"),
            parsed.data.decision,
            parsed.data.note,
            postAuth,
          );
          return c.json(result, 201);
        }
        if (!Array.isArray(parsed.data.values)) {
          const result = await agentChat.answerChatThreadMessageForm(
            auth.workspaceId,
            c.req.param("threadId"),
            c.req.param("messageId"),
            parsed.data.values,
            postAuth,
          );
          return c.json(result, 201);
        }
        const result = await agentChat.answerChatThreadMessageChoices(
          auth.workspaceId,
          c.req.param("threadId"),
          c.req.param("messageId"),
          parsed.data.values,
          postAuth,
        );
        return c.json(result, 201);
      } catch (error) {
        const status = errorStatus(error);
        const message =
          error instanceof Error ? error.message : "Could not answer message";
        return c.json({ error: message, code: errorCode(status) }, status);
      }
    },
  );

  /**
   * Agent-only: update own assistant message progress (and optional body).
   * SSE push only — never fires agent.chat.message webhook.
   */
  app.patch(
    "/api/v1/chat/threads/:threadId/messages/:messageId",
    async (c) => {
      const auth = getAuth(c);
      if (!canWriteAgentReply(auth) || !auth.apiKeyId) {
        return c.json(forbidden(), 403);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = updateChatThreadMessageInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: "Invalid update payload", code: "bad_request" },
          400,
        );
      }
      try {
        const result = await agentChat.updateChatThreadMessage(
          auth.workspaceId,
          c.req.param("threadId"),
          c.req.param("messageId"),
          {
            progress: parsed.data.progress,
            body: parsed.data.body,
          },
          { apiKeyId: auth.apiKeyId },
        );
        return c.json(result);
      } catch (error) {
        const status = errorStatus(error);
        const message =
          error instanceof Error ? error.message : "Could not update message";
        return c.json({ error: message, code: errorCode(status) }, status);
      }
    },
  );

  /** Soft-delete one message — owner / Access keys only. */
  app.delete(
    "/api/v1/chat/threads/:threadId/messages/:messageId",
    async (c) => {
      const auth = getAuth(c);
      if (!canWriteUserMessage(auth)) return c.json(forbidden(), 403);
      try {
        const ok = await agentChat.softDeleteChatThreadMessage(
          auth.workspaceId,
          c.req.param("threadId"),
          c.req.param("messageId"),
        );
        if (!ok) return c.json(notFound("Message"), 404);
        return c.body(null, 204);
      } catch (error) {
        const status = errorStatus(error);
        const message =
          error instanceof Error ? error.message : "Could not delete message";
        return c.json({ error: message, code: errorCode(status) }, status);
      }
    },
  );

  /** Soft-delete many messages — owner / Access keys only. */
  app.post("/api/v1/chat/threads/:threadId/messages/delete", async (c) => {
    const auth = getAuth(c);
    if (!canWriteUserMessage(auth)) return c.json(forbidden(), 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = deleteChatThreadMessagesInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid delete payload", code: "bad_request" },
        400,
      );
    }
    try {
      const result = await agentChat.softDeleteChatThreadMessages(
        auth.workspaceId,
        c.req.param("threadId"),
        parsed.data.messageIds,
      );
      return c.json(result);
    } catch (error) {
      const status = errorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not delete messages";
      return c.json({ error: message, code: errorCode(status) }, status);
    }
  });

  /**
   * Agent working/idle presence for a shell DM thread.
   * Only the agent's own API key for that thread's agent.
   */
  app.post("/api/v1/chat/threads/:threadId/status", async (c) => {
    const auth = getAuth(c);
    if (!canWriteAgentReply(auth) || !auth.apiKeyId) {
      return c.json(forbidden(), 403);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = updateChatThreadAgentStatusInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid status payload", code: "bad_request" },
        400,
      );
    }
    try {
      const result = await agentChat.setChatThreadAgentStatus(
        auth.workspaceId,
        c.req.param("threadId"),
        parsed.data.state,
        { apiKeyId: auth.apiKeyId },
        parsed.data.label,
      );
      return c.json(result);
    } catch (error) {
      const status = errorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not update status";
      return c.json({ error: message, code: errorCode(status) }, status);
    }
  });
}
