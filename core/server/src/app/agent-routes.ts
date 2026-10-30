/**
 * Chat agents CRUD (OS-151) — settings:write; secrets never returned.
 */
import type { Hono } from "hono";
import {
  createAgentInputSchema,
  updateAgentInputSchema,
} from "@backsteros/contracts";

import * as agentsService from "../services/agents.js";
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

export function registerAgentRoutes(app: Hono) {
  app.get("/api/v1/agents", async (c) => {
    const auth = getAuth(c);
    if (!canManageAgents(auth)) return c.json(forbidden(), 403);
    const agents = await agentsService.listAgents(auth.workspaceId);
    return c.json({ agents });
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
      const message =
        error instanceof Error ? error.message : "Could not create agent";
      const status =
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof (error as { status: unknown }).status === "number"
          ? ((error as { status: number }).status as 400)
          : 400;
      return c.json({ error: message, code: "bad_request" }, status);
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
      const message =
        error instanceof Error ? error.message : "Could not update agent";
      return c.json({ error: message, code: "bad_request" }, 400);
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
}
