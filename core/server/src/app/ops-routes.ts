import type { Context, Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createRecurringTaskSchema,
  updateRecurringTaskSchema,
} from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import { isOwnerShellAuth, resolveAuth } from "../middleware/auth.js";
import { isSpacesConfigured } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import { appendOpsLog } from "../lib/ops-log-buffer.js";
import * as opsService from "../services/ops.js";
import * as recurringTaskService from "../services/recurring-tasks.js";
import {
  buildRecurringTaskRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "../services/rest-leader-write.js";
import { recordRecurringTaskRestSyncEvent } from "../services/sync.js";

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

async function requireOwner(c: Context): Promise<Response | null> {
  const auth = await resolveAuth(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ error: "Unauthorized", code: "unauthorized" as const }, 401);
  }
  if (!isOwnerShellAuth(auth)) {
    return c.json(
      { error: "Owner shell session required", code: "unauthorized" as const },
      401,
    );
  }

  const isOwner = await opsService.assertWorkspaceOwner(
    auth.workspaceId,
    auth.userId!,
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
        const body = c.req.valid("json");
        const auth = getAuth(c);
        if (isRestLeaderFirstWrite()) {
          const recurringTaskId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "recurring_task",
            entityId: recurringTaskId,
            operation: "upsert",
            payload: buildRecurringTaskRestPayload(recurringTaskId, body),
          });
          const row = await recurringTaskService.getRecurringTaskById(
            auth.workspaceId,
            recurringTaskId,
          );
          if (!row || row.deletedAt) {
            return c.json(
              { error: "Recurring task create failed", code: "internal" },
              500,
            );
          }
          return c.json(recurringTaskService.toRecurringTask(row), 201);
        }
        const row = await recurringTaskService.createRecurringTask(
          auth.workspaceId,
          body,
        );
        const dbRow = await recurringTaskService.getRecurringTaskById(
          auth.workspaceId,
          row.id,
        );
        if (dbRow) {
          await recordRecurringTaskRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
        }
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
        const auth = getAuth(c);
        const recurringTaskId = c.req.param("id");
        const patch = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const existing = await recurringTaskService.getRecurringTaskById(
            auth.workspaceId,
            recurringTaskId,
          );
          if (!existing || existing.deletedAt) {
            return c.json(
              { error: "Recurring task not found", code: "not_found" as const },
              404,
            );
          }
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "recurring_task",
            entityId: recurringTaskId,
            operation: "upsert",
            payload: buildRecurringTaskRestPayload(recurringTaskId, patch),
          });
          const row = await recurringTaskService.getRecurringTaskById(
            auth.workspaceId,
            recurringTaskId,
          );
          if (!row || row.deletedAt) {
            return c.json(
              { error: "Recurring task not found", code: "not_found" as const },
              404,
            );
          }
          return c.json(recurringTaskService.toRecurringTask(row));
        }
        const row = await recurringTaskService.updateRecurringTask(
          auth.workspaceId,
          recurringTaskId,
          patch,
        );
        if (!row) {
          return c.json(
            { error: "Recurring task not found", code: "not_found" as const },
            404,
          );
        }
        const dbRow = await recurringTaskService.getRecurringTaskById(
          auth.workspaceId,
          recurringTaskId,
        );
        if (dbRow) {
          await recordRecurringTaskRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
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

    const auth = getAuth(c);
    const recurringTaskId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await recurringTaskService.getRecurringTaskById(
        auth.workspaceId,
        recurringTaskId,
      );
      if (!existing || existing.deletedAt) {
        return c.json(
          { error: "Recurring task not found", code: "not_found" as const },
          404,
        );
      }
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "recurring_task",
        entityId: recurringTaskId,
        operation: "delete",
        payload: {
          id: recurringTaskId,
          deleted_at: new Date().toISOString(),
        },
      });
      return c.body(null, 204);
    }

    const deleted = await recurringTaskService.deleteRecurringTask(
      auth.workspaceId,
      recurringTaskId,
    );
    if (!deleted) {
      return c.json(
        { error: "Recurring task not found", code: "not_found" as const },
        404,
      );
    }
    await recordRecurringTaskRestSyncEvent(
      auth.workspaceId,
      deleted,
      "delete",
    );
    return c.body(null, 204);
  });

  // Seed a startup marker so the tail is never empty in a fresh process.
  appendOpsLog("info", "ops routes registered");
}
