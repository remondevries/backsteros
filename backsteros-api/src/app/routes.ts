import type { Context, Hono, Next } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createApiKeySchema,
  createProjectSchema,
  createTaskSchema,
  updateProjectSchema,
  updateTaskSchema,
} from "@backsteros/contracts";

import { toApiKey, toProject, toTask } from "../lib/mappers.js";
import type { AuthContext } from "../middleware/auth.js";
import { requireScope, resolveAuth } from "../middleware/auth.js";
import * as apiKeyService from "../services/api-keys.js";
import * as taskProjectService from "../services/tasks-projects.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function forbidden() {
  return { error: "Insufficient scope", code: "forbidden" as const };
}

function notFound(resource: string) {
  return { error: `${resource} not found`, code: "not_found" as const };
}

async function withAuth(c: Context, next: Next) {
  const auth = await resolveAuth(c.req.header("Authorization"));
  if (!auth) {
    return c.json(unauthorized(), 401);
  }
  c.set("auth", auth);
  await next();
}

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

export function registerApiRoutes(app: Hono) {
  app.use("/api/v1/*", withAuth);

  app.get("/api/v1/projects", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const rows = await taskProjectService.listProjects();
    return c.json({ projects: rows.map(toProject) });
  });

  app.get("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.getProjectById(c.req.param("id"));
    if (!row) {
      return c.json(notFound("Project"), 404);
    }

    return c.json(toProject(row));
  });

  app.post(
    "/api/v1/projects",
    zValidator("json", createProjectSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await taskProjectService.createProject(c.req.valid("json"));
        return c.json(toProject(row), 201);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_KEY_EXISTS") {
          return c.json(
            { error: "Project key already exists", code: "project_key_exists" },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/projects/:id",
    zValidator("json", updateProjectSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await taskProjectService.updateProject(
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("Project"), 404);
        }
        return c.json(toProject(row));
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_KEY_EXISTS") {
          return c.json(
            { error: "Project key already exists", code: "project_key_exists" },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.deleteProject(c.req.param("id"));
    if (!row) {
      return c.json(notFound("Project"), 404);
    }

    return c.body(null, 204);
  });

  app.get("/api/v1/tasks", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const projectId = c.req.query("projectId");
    const rows = await taskProjectService.listTasks(projectId);
    return c.json({ tasks: rows.map(toTask) });
  });

  app.get("/api/v1/tasks/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.getTaskById(c.req.param("id"));
    if (!row) {
      return c.json(notFound("Task"), 404);
    }

    return c.json(toTask(row));
  });

  app.post(
    "/api/v1/tasks",
    zValidator("json", createTaskSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await taskProjectService.createTask(c.req.valid("json"));
        return c.json(toTask(row), 201);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/tasks/:id",
    zValidator("json", updateTaskSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await taskProjectService.updateTask(
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("Task"), 404);
        }
        return c.json(toTask(row));
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/tasks/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.deleteTask(c.req.param("id"));
    if (!row) {
      return c.json(notFound("Task"), 404);
    }

    return c.body(null, 204);
  });

  app.get("/api/v1/api-keys", async (c) => {
    const auth = getAuth(c);
    if (auth.kind !== "clerk" || !auth.userId) {
      return c.json(unauthorized(), 401);
    }

    const rows = await apiKeyService.listApiKeys(auth.userId);
    return c.json({ apiKeys: rows.map(toApiKey) });
  });

  app.post(
    "/api/v1/api-keys",
    zValidator("json", createApiKeySchema),
    async (c) => {
      const auth = getAuth(c);
      if (auth.kind !== "clerk" || !auth.userId) {
        return c.json(unauthorized(), 401);
      }

      const { row, secret } = await apiKeyService.createApiKey(
        auth.userId,
        c.req.valid("json"),
      );

      return c.json({ apiKey: toApiKey(row), secret }, 201);
    },
  );

  app.delete("/api/v1/api-keys/:id", async (c) => {
    const auth = getAuth(c);
    if (auth.kind !== "clerk" || !auth.userId) {
      return c.json(unauthorized(), 401);
    }

    const row = await apiKeyService.revokeApiKey(auth.userId, c.req.param("id"));
    if (!row) {
      return c.json(notFound("API key"), 404);
    }

    return c.body(null, 204);
  });
}
