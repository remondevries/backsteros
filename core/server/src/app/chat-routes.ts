import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createChatConversationInputSchema,
  createChatMessageInputSchema,
  chatMessagingWindowQuerySchema,
  listChatConversationsQuerySchema,
  listChatInboxesQuerySchema,
  listChatWhatsAppTemplatesQuerySchema,
  toggleChatTypingInputSchema,
  updateChatConversationInputSchema,
  updateChatwootSettingsSchema,
} from "@backsteros/contracts";

import {
  subscribeChatTyping,
  subscribeChatUpdated,
} from "../lib/chat-events.js";
import { ChatwootApiError } from "../lib/chatwoot-client.js";
import { chatwootHeadersFromRequest } from "../lib/chatwoot-webhook.js";
import {
  readIdempotencyKey,
  withIdempotency,
} from "../lib/idempotency.js";
import * as chatCreateService from "../services/chat-create-conversation.js";
import * as chatService from "../services/chat-service.js";
import * as chatwootSettingsService from "../services/chatwoot-settings.js";
import { can, forbidden, getAuth, notFound } from "./route-helpers.js";

function chatErrorStatus(error: unknown): 400 | 404 | 422 {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    if (status === 404) return 404;
    if (status === 422) return 422;
  }
  if (error instanceof ChatwootApiError && error.status === 404) return 404;
  return 400;
}

function chatErrorCode(error: unknown, status: 400 | 404 | 422): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  if (status === 404) return "not_found";
  if (status === 422) return "unprocessable";
  return "bad_request";
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
    if (!can(auth, "chat:read")) return c.json(forbidden(), 403);
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
            unsubscribeUpdated();
            unsubscribeTyping();
          })
          .finally(() => {
            pendingWrites = Math.max(0, pendingWrites - 1);
          });
      };
      const unsubscribeUpdated = subscribeChatUpdated(workspaceId, (event) => {
        writeEvent("chat.updated", {
          conversationId: event.conversationId,
          messageId: event.messageId,
          kind: event.kind,
        });
      });
      const unsubscribeTyping = subscribeChatTyping(workspaceId, (event) => {
        writeEvent("chat.typing", {
          conversationId: event.conversationId,
          typing: event.typing,
        });
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribeUpdated();
        unsubscribeTyping();
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
          unsubscribeUpdated();
          unsubscribeTyping();
          break;
        }
      }
    });
  });

  app.post("/api/v1/chat/sync", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:write")) return c.json(forbidden(), 403);
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
    if (!can(auth, "chat:read")) return c.json(forbidden(), 403);
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

  app.post("/api/v1/chat/conversations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:write")) return c.json(forbidden(), 403);
    const parsed = createChatConversationInputSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid create chat conversation payload", code: "bad_request" },
        400,
      );
    }
    const validateQ = c.req.query("validate");
    const wantDryRun =
      Boolean(parsed.data.dryRun) ||
      Boolean(parsed.data.validate) ||
      validateQ === "1" ||
      validateQ === "true";
    const input = {
      ...parsed.data,
      dryRun: wantDryRun ? true : parsed.data.dryRun,
      validate: wantDryRun ? true : parsed.data.validate,
    };
    const idempotencyKey = readIdempotencyKey(
      c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key"),
    );
    const runCreate = async () => {
      try {
        const body = await chatCreateService.createChatConversation(
          auth.workspaceId,
          input,
        );
        return { status: 200 as const, body };
      } catch (error) {
        const status = chatErrorStatus(error);
        const message =
          error instanceof Error
            ? error.message
            : "Could not create conversation";
        return {
          status,
          body: { error: message, code: chatErrorCode(error, status) },
        };
      }
    };
    if (idempotencyKey && !wantDryRun) {
      const scope =
        auth.apiKeyId != null
          ? `api_key:${auth.apiKeyId}:chat`
          : `ws:${auth.workspaceId}:chat`;
      const result = await withIdempotency(scope, idempotencyKey, runCreate);
      return c.json(result.body, result.status as 200 | 400 | 404 | 422);
    }
    const result = await runCreate();
    return c.json(result.body, result.status);
  });

  app.get("/api/v1/chat/inboxes", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:read")) return c.json(forbidden(), 403);
    const parsed = listChatInboxesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid chat inboxes query", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await chatCreateService.listChatInboxes(
          auth.workspaceId,
          parsed.data.channel,
        ),
      );
    } catch (error) {
      const status = chatErrorStatus(error);
      const message =
        error instanceof Error ? error.message : "Could not list inboxes";
      return c.json(
        { error: message, code: chatErrorCode(error, status) },
        status,
      );
    }
  });

  app.get("/api/v1/chat/messaging-window", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:read")) return c.json(forbidden(), 403);
    const parsed = chatMessagingWindowQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid messaging window query", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await chatCreateService.getChatMessagingWindow(
          auth.workspaceId,
          parsed.data,
        ),
      );
    } catch (error) {
      const status = chatErrorStatus(error);
      const message =
        error instanceof Error
          ? error.message
          : "Could not resolve messaging window";
      return c.json(
        { error: message, code: chatErrorCode(error, status) },
        status,
      );
    }
  });

  app.get("/api/v1/chat/whatsapp-templates", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:read")) return c.json(forbidden(), 403);
    const parsed = listChatWhatsAppTemplatesQuerySchema.safeParse(
      c.req.query(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid WhatsApp templates query", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await chatCreateService.listChatWhatsAppTemplates(
          auth.workspaceId,
          parsed.data.inboxId,
        ),
      );
    } catch (error) {
      const status = chatErrorStatus(error);
      const message =
        error instanceof Error
          ? error.message
          : "Could not list WhatsApp templates";
      return c.json(
        { error: message, code: chatErrorCode(error, status) },
        status,
      );
    }
  });

  app.get("/api/v1/chat/conversations/:conversationId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:read")) return c.json(forbidden(), 403);
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
      if (!can(auth, "chat:write")) return c.json(forbidden(), 403);
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

  app.post(
    "/api/v1/chat/conversations/:conversationId/typing",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "chat:write")) return c.json(forbidden(), 403);
      const conversationId = c.req.param("conversationId");
      const parsed = toggleChatTypingInputSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          { error: "Invalid chat typing payload", code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await chatService.toggleChatTyping(
            auth.workspaceId,
            conversationId,
            parsed.data.typing,
          ),
        );
      } catch (error) {
        const status = chatErrorStatus(error);
        const message =
          error instanceof Error
            ? error.message
            : "Could not toggle typing status";
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
    if (!can(auth, "chat:write")) return c.json(forbidden(), 403);
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

  app.delete("/api/v1/chat/conversations/:conversationId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "chat:write")) return c.json(forbidden(), 403);
    const conversationId = c.req.param("conversationId");
    try {
      return c.json(
        await chatService.deleteChatConversation(
          auth.workspaceId,
          conversationId,
        ),
      );
    } catch (error) {
      const status = chatErrorStatus(error);
      const message =
        error instanceof Error
          ? error.message
          : "Could not delete conversation";
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
