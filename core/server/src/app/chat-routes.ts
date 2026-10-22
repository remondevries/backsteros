import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createChatMessageInputSchema,
  listChatConversationsQuerySchema,
  updateChatConversationInputSchema,
  updateChatwootSettingsSchema,
} from "@backsteros/contracts";

import { subscribeChatUpdated } from "../lib/chat-events.js";
import { ChatwootApiError } from "../lib/chatwoot-client.js";
import { chatwootHeadersFromRequest } from "../lib/chatwoot-webhook.js";
import * as chatService from "../services/chat-service.js";
import * as chatwootSettingsService from "../services/chatwoot-settings.js";
import { can, forbidden, getAuth, notFound } from "./route-helpers.js";

function chatErrorStatus(error: unknown): 400 | 404 {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  ) {
    return 404;
  }
  if (error instanceof ChatwootApiError && error.status === 404) return 404;
  return 400;
}

export function registerChatRoutes(app: Hono) {
  app.get("/api/v1/settings/chatwoot", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await chatwootSettingsService.getChatwootSettings(auth.workspaceId),
    );
  });

  app.patch("/api/v1/settings/chatwoot", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateChatwootSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid Chatwoot settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await chatwootSettingsService.updateChatwootSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });

  app.get("/api/v1/settings/chatwoot/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await chatwootSettingsService.testChatwootConnection(auth.workspaceId),
    );
  });

  app.post("/api/v1/webhooks/chatwoot", async (c) => {
    const rawBody = await c.req.text();
    const headers = chatwootHeadersFromRequest((name) => c.req.header(name));
    const result = await chatService.handleChatwootWebhookDelivery({
      rawBody,
      headers,
    });
    if (!result.ok) {
      return c.body(null, 400);
    }
    return c.body(null, 204);
  });

  app.get("/api/v1/chat/events", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 16;
      const unsubscribe = subscribeChatUpdated(workspaceId, (event) => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        void stream
          .writeSSE({
            event: "chat.updated",
            data: JSON.stringify({
              conversationId: event.conversationId,
              messageId: event.messageId,
              kind: event.kind,
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
        event: "ping",
        data: JSON.stringify({ ok: true }),
      });
      while (!closed) {
        await stream.sleep(15_000);
        if (closed) break;
        try {
          await stream.writeSSE({
            event: "ping",
            data: JSON.stringify({ ok: true }),
          });
        } catch {
          closed = true;
          unsubscribe();
          break;
        }
      }
    });
  });

  app.post("/api/v1/chat/sync", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    try {
      return c.json(
        await chatService.syncChatwootConversations(auth.workspaceId),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not sync Chatwoot";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });

  app.get("/api/v1/chat/conversations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const parsed = listChatConversationsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid chat conversations query", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await chatService.listChatConversations(auth.workspaceId, parsed.data),
    );
  });

  app.get("/api/v1/chat/conversations/:conversationId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const conversationId = c.req.param("conversationId");
    const detail = await chatService.getChatConversation(
      auth.workspaceId,
      conversationId,
    );
    if (!detail) return c.json(notFound("Conversation"), 404);
    return c.json(detail);
  });

  app.post(
    "/api/v1/chat/conversations/:conversationId/messages",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const conversationId = c.req.param("conversationId");
      const parsed = createChatMessageInputSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          { error: "Invalid chat message", code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await chatService.createChatMessage(
            auth.workspaceId,
            conversationId,
            parsed.data,
          ),
        );
      } catch (error) {
        const status = chatErrorStatus(error);
        const message =
          error instanceof Error ? error.message : "Could not send message";
        return c.json(
          {
            error: message,
            code: status === 404 ? "not_found" : "bad_request",
          },
          status,
        );
      }
    },
  );

  app.patch("/api/v1/chat/conversations/:conversationId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const conversationId = c.req.param("conversationId");
    const parsed = updateChatConversationInputSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid chat conversation update", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await chatService.updateChatConversation(
          auth.workspaceId,
          conversationId,
          parsed.data,
        ),
      );
    } catch (error) {
      const status = chatErrorStatus(error);
      const message =
        error instanceof Error
          ? error.message
          : "Could not update conversation";
      return c.json(
        {
          error: message,
          code: status === 404 ? "not_found" : "bad_request",
        },
        status,
      );
    }
  });
}
