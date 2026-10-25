import {
  createProjectUpdateSchema,
  forbidden,
  getAuth,
  notFound,
  notifyPeerOfEntityWrite,
  projectUpdatesService,
  publishProjectUpdateWorkspaceUpdated,
  requireScope,
  routeProjectId,
  taskProjectService,
  unauthorized,
  updateProjectUpdateSchema,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Project updates. */
export function registerProjectUpdateRoutes(app: Hono) {
  app.get("/api/v1/projects/:id/updates", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    const updates = await projectUpdatesService.listProjectUpdates(
      auth.workspaceId,
      projectId,
    );
    return c.json({ updates });
  });

  app.post(
    "/api/v1/projects/:id/updates",
    zValidator("json", createProjectUpdateSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const projectIdRaw = c.req.param("id");
      const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
      if (!projectId) return c.json(notFound("Project"), 404);
      try {
        const row = await projectUpdatesService.createProjectUpdate(
          auth.workspaceId,
          projectId,
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("Project"), 404);
        }
        notifyPeerOfEntityWrite({
          workspaceId: auth.workspaceId,
          reason: "rest",
          entity: "project_update",
          entityId: row.id,
          projectId,
          operation: "upsert",
        });
        publishProjectUpdateWorkspaceUpdated(auth.workspaceId, row.id, {
          projectId,
          operation: "upsert",
        });
        return c.json(row, 201);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "RELATED_TASK_NOT_FOUND"
        ) {
          return c.json({ error: "Related task not found" }, 400);
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/project-updates/:id",
    zValidator("json", updateProjectUpdateSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      try {
        const row = await projectUpdatesService.updateProjectUpdate(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("Project update"), 404);
        }
        notifyPeerOfEntityWrite({
          workspaceId: auth.workspaceId,
          reason: "rest",
          entity: "project_update",
          entityId: row.id,
          projectId: row.projectId,
          operation: "upsert",
        });
        publishProjectUpdateWorkspaceUpdated(auth.workspaceId, row.id, {
          projectId: row.projectId,
          operation: "upsert",
        });
        return c.json(row);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "RELATED_TASK_NOT_FOUND"
        ) {
          return c.json({ error: "Related task not found" }, 400);
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/project-updates/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const updateId = c.req.param("id");
    const existing = await projectUpdatesService.getProjectUpdateById(
      auth.workspaceId,
      updateId,
    );
    const ok = await projectUpdatesService.softDeleteProjectUpdate(
      auth.workspaceId,
      updateId,
    );
    if (!ok) {
      return c.json(notFound("Project update"), 404);
    }
    notifyPeerOfEntityWrite({
      workspaceId: auth.workspaceId,
      reason: "rest",
      entity: "project_update",
      entityId: updateId,
      projectId: existing?.projectId ?? null,
      operation: "delete",
    });
    publishProjectUpdateWorkspaceUpdated(auth.workspaceId, updateId, {
      projectId: existing?.projectId ?? null,
      operation: "delete",
    });
    return c.body(null, 204);
  });
}
