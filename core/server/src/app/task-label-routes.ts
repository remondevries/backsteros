import type { Context, Hono } from "hono";
import { z } from "zod";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import * as taskLabelService from "../services/task-labels.js";

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .nullable()
  .optional();

const createSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(80),
  color: colorSchema,
  description: z.string().max(500).nullable().optional(),
  parentId: z.string().min(1).max(64).nullable().optional(),
  isGroup: z.boolean().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    color: colorSchema,
    description: z.string().max(500).nullable().optional(),
    parentId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.description !== undefined ||
      value.parentId !== undefined,
    { message: "At least one field is required" },
  );

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

function forbidden() {
  return { error: "Insufficient scope", code: "forbidden" as const };
}

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function labelError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "TASK_LABEL_NAME_TAKEN") {
    return {
      status: 409 as const,
      body: { error: "A label with that name already exists", code: "task_label_name_taken" },
    };
  }
  if (error.message === "INVALID_TASK_LABEL") {
    return {
      status: 400 as const,
      body: { error: "Invalid label", code: "invalid_task_label" },
    };
  }
  return null;
}

export function registerTaskLabelRoutes(app: Hono) {
  app.get("/api/v1/task-labels", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const labels = await taskLabelService.listTaskLabels(auth.workspaceId);
    return c.json({ labels });
  });

  app.post("/api/v1/task-labels", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid label", code: "invalid_task_label" }, 400);
    }
    try {
      const label = await taskLabelService.createTaskLabel(
        auth.workspaceId,
        parsed.data,
      );
      return c.json(label, 201);
    } catch (error) {
      const mapped = labelError(error);
      if (mapped) return c.json(mapped.body, mapped.status);
      throw error;
    }
  });

  app.patch("/api/v1/task-labels/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid label", code: "invalid_task_label" }, 400);
    }
    try {
      const label = await taskLabelService.updateTaskLabel(
        auth.workspaceId,
        c.req.param("id"),
        parsed.data,
      );
      if (!label) {
        return c.json({ error: "Label not found", code: "not_found" }, 404);
      }
      return c.json(label);
    } catch (error) {
      const mapped = labelError(error);
      if (mapped) return c.json(mapped.body, mapped.status);
      throw error;
    }
  });

  app.delete("/api/v1/task-labels/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const label = await taskLabelService.deleteTaskLabel(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!label) {
      return c.json({ error: "Label not found", code: "not_found" }, 404);
    }
    return c.body(null, 204);
  });
}
