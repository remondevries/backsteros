/**
 * Chat agents CRUD (OS-151) — settings:write; secrets never returned.
 */
import type { Context, Hono } from "hono";
import {
  createAgentInputSchema,
  reorderAgentsInputSchema,
  reportAgentIdentityInputSchema,
  updateAgentInputSchema,
} from "@backsteros/contracts";

import * as agentsService from "../services/agents.js";
import * as agentChatService from "../services/agent-chat.js";
import {
  can,
  forbidden,
  getAuth,
  isAgentPersonaAuth,
  notFound,
} from "./route-helpers.js";

function canManageAgents(auth: ReturnType<typeof getAuth>): boolean {
  if (isAgentPersonaAuth(auth)) return false;
  return can(auth, "settings:write") || can(auth, "settings:read");
}

function canWriteAgents(auth: ReturnType<typeof getAuth>): boolean {
  if (isAgentPersonaAuth(auth)) return false;
  return can(auth, "settings:write");
}

/** 409 keeps `existingAgentId` so callers can point at the clashing row. */
function agentWriteErrorResponse(c: Context, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const meta = (error ?? {}) as { status?: unknown; existingAgentId?: unknown };
  if (meta.status === 409 && typeof meta.existingAgentId === "string") {
    return c.json(
      { error: message, code: "conflict", existingAgentId: meta.existingAgentId },
      409,
    );
  }
  return c.json({ error: message, code: "bad_request" }, 400);
}

export function registerAgentRoutes(app: Hono) {
  app.get("/api/v1/agents", async (c) => {
    const auth = getAuth(c);
    if (!canManageAgents(auth)) return c.json(forbidden(), 403);
    const agents = await agentsService.listAgents(auth.workspaceId);
    return c.json({ agents });
  });

  // Before /:agentId so "reorder" is not captured as an id.
  app.put("/api/v1/agents/reorder", async (c) => {
    const auth = getAuth(c);
    if (!canWriteAgents(auth)) return c.json(forbidden(), 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = reorderAgentsInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid reorder payload", code: "bad_request" },
        400,
      );
    }
    try {
      const agents = await agentsService.reorderAgents(
        auth.workspaceId,
        parsed.data.agentIds,
      );
      return c.json({ agents });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not reorder agents";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });

  // Agent self-service: the calling API key decides which agent row is used,
  // so no settings scope is needed and an agent can only touch its own row.
  app.get("/api/v1/agents/me", async (c) => {
    const auth = getAuth(c);
    if (auth.kind !== "api_key" || !auth.apiKeyId) {
      return c.json(forbidden(), 403);
    }
    const agent = await agentsService.getAgentForApiKey(
      auth.workspaceId,
      auth.apiKeyId,
    );
    if (!agent) return c.json(notFound("Agent for this API key"), 404);
    return c.json(agent);
  });

  app.patch("/api/v1/agents/me", async (c) => {
    const auth = getAuth(c);
    if (auth.kind !== "api_key" || !auth.apiKeyId) {
      return c.json(forbidden(), 403);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = reportAgentIdentityInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Send { \"grokbotAgentId\": \"<your Grok Bot agent id>\" }",
          code: "bad_request",
        },
        400,
      );
    }
    try {
      const agent = await agentsService.reportAgentIdentity(
        auth.workspaceId,
        auth.apiKeyId,
        parsed.data.grokbotAgentId,
      );
      if (!agent) return c.json(notFound("Agent for this API key"), 404);
      return c.json(agent);
    } catch (error) {
      return agentWriteErrorResponse(c, error, "Could not save agent id");
    }
  });

  app.get("/api/v1/agents/:agentId", async (c) => {
    const auth = getAuth(c);
    if (!canManageAgents(auth)) return c.json(forbidden(), 403);
    const agent = await agentsService.getAgent(
      auth.workspaceId,
      c.req.param("agentId"),
    );
    if (!agent) return c.json(notFound("Agent"), 404);
    return c.json(agent);
  });

  app.post("/api/v1/agents", async (c) => {
    const auth = getAuth(c);
    if (!canWriteAgents(auth)) return c.json(forbidden(), 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = createAgentInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid agent payload", code: "bad_request" },
        400,
      );
    }
    try {
      const created = await agentsService.createAgent(
        auth.workspaceId,
        parsed.data,
      );
      return c.json(created, 201);
    } catch (error) {
      return agentWriteErrorResponse(c, error, "Could not create agent");
    }
  });

  app.patch("/api/v1/agents/:agentId", async (c) => {
    const auth = getAuth(c);
    if (!canWriteAgents(auth)) return c.json(forbidden(), 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
    }
    const parsed = updateAgentInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid agent payload", code: "bad_request" },
        400,
      );
    }
    try {
      const updated = await agentsService.updateAgent(
        auth.workspaceId,
        c.req.param("agentId"),
        parsed.data,
      );
      if (!updated) return c.json(notFound("Agent"), 404);
      return c.json(updated);
    } catch (error) {
      return agentWriteErrorResponse(c, error, "Could not update agent");
    }
  });

  app.delete("/api/v1/agents/:agentId", async (c) => {
    const auth = getAuth(c);
    if (!canWriteAgents(auth)) return c.json(forbidden(), 403);
    const ok = await agentsService.deleteAgent(
      auth.workspaceId,
      c.req.param("agentId"),
    );
    if (!ok) return c.json(notFound("Agent"), 404);
    return c.body(null, 204);
  });

  app.post("/api/v1/agents/:agentId/webhook/test", async (c) => {
    const auth = getAuth(c);
    if (!canWriteAgents(auth)) return c.json(forbidden(), 403);
    const result = await agentChatService.testAgentWebhook(
      auth.workspaceId,
      c.req.param("agentId"),
    );
    if (!result) return c.json(notFound("Agent"), 404);
    return c.json(result);
  });
}
