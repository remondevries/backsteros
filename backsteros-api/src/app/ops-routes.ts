import type { Context, Hono } from "hono";

import type { AuthContext } from "../middleware/auth.js";
import { resolveAuth } from "../middleware/auth.js";
import { isSpacesConfigured } from "../lib/storage.js";
import { appendOpsLog } from "../lib/ops-log-buffer.js";
import * as opsService from "../services/ops.js";

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

export function registerOpsRoutes(app: Hono) {
  app.get("/api/v1/ops/sync-health", async (c) => {
    const auth = await resolveAuth(c.req.header("Authorization"));
    if (!auth) {
      return c.json({ error: "Unauthorized", code: "unauthorized" as const }, 401);
    }
    if (auth.kind !== "clerk" || !auth.userId) {
      return c.json(
        { error: "Clerk session required", code: "unauthorized" as const },
        401,
      );
    }

    const isOwner = await opsService.assertWorkspaceOwner(
      auth.workspaceId,
      auth.userId,
      auth.membershipRole,
    );
    if (!isOwner) {
      return c.json({ error: "Owner only", code: "forbidden" as const }, 403);
    }

    c.set("auth", auth);
    const payload = await opsService.getOpsSyncHealth(
      getAuth(c).workspaceId,
      isSpacesConfigured(),
    );
    return c.json(payload);
  });

  app.get("/api/v1/ops/logs", async (c) => {
    const auth = await resolveAuth(c.req.header("Authorization"));
    if (!auth) {
      return c.json({ error: "Unauthorized", code: "unauthorized" as const }, 401);
    }
    if (auth.kind !== "clerk" || !auth.userId) {
      return c.json(
        { error: "Clerk session required", code: "unauthorized" as const },
        401,
      );
    }

    const isOwner = await opsService.assertWorkspaceOwner(
      auth.workspaceId,
      auth.userId,
      auth.membershipRole,
    );
    if (!isOwner) {
      return c.json({ error: "Owner only", code: "forbidden" as const }, 403);
    }

    const limitRaw = Number(c.req.query("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    return c.json({ logs: opsService.getOpsLogTail(limit) });
  });

  // Seed a startup marker so the tail is never empty in a fresh process.
  appendOpsLog("info", "ops routes registered");
}
