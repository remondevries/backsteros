/**
 * Agent message webhook registration (OS-146) — not under /settings.
 */
import type { Hono } from "hono";
import { createAgentMessageWebhookInputSchema } from "@backsteros/contracts";

import * as agentMessageWebhooks from "../services/agent-message-webhooks.js";
import { can, forbidden, getAuth, notFound } from "./route-helpers.js";

function canManageMessageWebhooks(
  auth: ReturnType<typeof getAuth>,
): boolean {
  return can(auth, "chat:read") || can(auth, "email:read");
}

export function registerAgentMessageWebhookRoutes(app: Hono) {
  app.get("/api/v1/agent/message-webhooks", async (c) => {
    const auth = getAuth(c);
    if (!canManageMessageWebhooks(auth)) return c.json(forbidden(), 403);
    const webhooks = await agentMessageWebhooks.listAgentMessageWebhooks(
      auth.workspaceId,
      auth.kind === "api_key" && auth.contactId != null ? auth.apiKeyId : null,
    );
    return c.json({ webhooks });
  });

  app.post("/api/v1/agent/message-webhooks", async (c) => {
    const auth = getAuth(c);
    if (!canManageMessageWebhooks(auth)) return c.json(forbidden(), 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = createAgentMessageWebhookInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid agent message webhook payload", code: "bad_request" },
        400,
      );
    }
    try {
      const created = await agentMessageWebhooks.createAgentMessageWebhook({
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        url: parsed.data.url,
        events: parsed.data.events,
      });
      return c.json(created);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create webhook";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });

  app.delete("/api/v1/agent/message-webhooks/:webhookId", async (c) => {
    const auth = getAuth(c);
    if (!canManageMessageWebhooks(auth)) return c.json(forbidden(), 403);
    const webhookId = c.req.param("webhookId");
    const ok = await agentMessageWebhooks.revokeAgentMessageWebhook({
      workspaceId: auth.workspaceId,
      apiKeyId:
        auth.kind === "api_key" && auth.contactId != null ? auth.apiKeyId : null,
      webhookId,
    });
    if (!ok) return c.json(notFound("Webhook"), 404);
    return c.json({ ok: true as const });
  });
}
