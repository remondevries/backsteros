import type { Context, Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createRecurringTaskSchema,
  updateRecurringTaskSchema,
} from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import { resolveAuth } from "../middleware/auth.js";
import { isSpacesConfigured } from "../lib/storage.js";
import { appendOpsLog } from "../lib/ops-log-buffer.js";
import * as opsService from "../services/ops.js";
import * as recurringTaskService from "../services/recurring-tasks.js";

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

async function requireOwner(c: Context): Promise<Response | null> {
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
  return null;
}

export function registerOpsRoutes(app: Hono) {
  app.get("/api/v1/ops/sync-health", async (c) => {
    const denied = await requireOwner(c);
    if (denied) return denied;

    const payload = await opsService.getOpsSyncHealth(
      getAuth(c).workspaceId,
      isSpacesConfigured(),
    );
    return c.json(payload);
  });

  app.get("/api/v1/ops/logs", async (c) => {
    const denied = await requireOwner(c);
    if (denied) return denied;

    const limitRaw = Number(c.req.query("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    return c.json({ logs: opsService.getOpsLogTail(limit) });
  });

  app.get("/api/v1/ops/recurring-tasks", async (c) => {
    const denied = await requireOwner(c);
    if (denied) return denied;

    const recurringTasks = await recurringTaskService.listRecurringTasks(
      getAuth(c).workspaceId,
    );
    return c.json({ recurringTasks });
  });

  app.post(
    "/api/v1/ops/recurring-tasks",
    zValidator("json", createRecurringTaskSchema),
    async (c) => {
      const denied = await requireOwner(c);
      if (denied) return denied;

      try {
        const row = await recurringTaskService.createRecurringTask(
          getAuth(c).workspaceId,
          c.req.valid("json"),
        );
        return c.json(row, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "PROJECT_NOT_FOUND") {
          return c.json(
            { error: "Project not found", code: "not_found" as const },
            404,
          );
        }
        if (message.startsWith("Invalid") || message.includes("Cron")) {
          return c.json(
            {
              error: message,
              code: "bad_request" as const,
              details: [{ path: "cronExpression", message }],
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/ops/recurring-tasks/:id",
    zValidator("json", updateRecurringTaskSchema),
    async (c) => {
      const denied = await requireOwner(c);
      if (denied) return denied;

      try {
        const row = await recurringTaskService.updateRecurringTask(
          getAuth(c).workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(
            { error: "Recurring task not found", code: "not_found" as const },
            404,
          );
        }
        return c.json(row);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "PROJECT_NOT_FOUND") {
          return c.json(
            { error: "Project not found", code: "not_found" as const },
            404,
          );
        }
        if (message.startsWith("Invalid") || message.includes("Cron")) {
          return c.json(
            {
              error: message,
              code: "bad_request" as const,
              details: [{ path: "cronExpression", message }],
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/ops/recurring-tasks/:id", async (c) => {
    const denied = await requireOwner(c);
    if (denied) return denied;

    const deleted = await recurringTaskService.deleteRecurringTask(
      getAuth(c).workspaceId,
      c.req.param("id"),
    );
    if (!deleted) {
      return c.json(
        { error: "Recurring task not found", code: "not_found" as const },
        404,
      );
    }
    return c.body(null, 204);
  });

  // Seed a startup marker so the tail is never empty in a fresh process.
  appendOpsLog("info", "ops routes registered");
}
