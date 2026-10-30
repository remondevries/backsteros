/**
 * Shell chat threads (OS-150) — Remon sends; agent API key replies.
 */
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createChatThreadMessageInputSchema,
  deleteChatThreadMessagesInputSchema,
  getOrCreateChatThreadInputSchema,
  updateChatThreadAgentStatusInputSchema,
} from "@backsteros/contracts";

import * as agentChat from "../services/agent-chat.js";
import {
  AGENT_SHELL_CHAT_SSE_EVENT,
  AGENT_SHELL_CHAT_STATUS_SSE_EVENT,
  subscribeAgentShellChatMessage,
  subscribeAgentShellChatStatus,
} from "../lib/agent-shell-chat-events.js";
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

function errorStatus(error: unknown): 400 | 403 | 404 {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    if (status === 404) return 404;
    if (status === 403) return 403;
  }
  return 400;
}

function errorCode(status: 400 | 403 | 404): string {
  if (status === 404) return "not_found";
  if (status === 403) return "forbidden";
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
      );
      return c.json(result, 201);
    } catch (error) {
      const status = errorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not post message";
      return c.json({ error: message, code: errorCode(status) }, status);
    }
  });

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
