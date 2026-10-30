/**
 * Shell chat threads (OS-150) — Remon sends; agent API key replies.
 */
import type { Hono } from "hono";
import {
  createChatThreadMessageInputSchema,
  getOrCreateChatThreadInputSchema,
} from "@backsteros/contracts";

import * as agentChat from "../services/agent-chat.js";
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
}
