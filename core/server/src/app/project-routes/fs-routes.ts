import {
  forbidden,
  getAuth,
  locationFsCreateFolderSchema,
  locationFsListQuerySchema,
  locationFsService,
  notFound,
  projectFsCreateEntrySchema,
  projectFsService,
  projectFsWriteFileSchema,
  requireScope,
  resolveVaultPath,
  routeProjectId,
  taskProjectService,
  unauthorized,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Project docs, project filesystem and location filesystem. */
export function registerProjectFsRoutes(app: Hono) {
  async function loadCodebaseFsProject(workspaceId: string, projectId: string) {
    const project = await taskProjectService.getProjectById(
      workspaceId,
      projectId,
    );
    if (!project) {
      return { error: notFound("Project"), status: 404 as const };
    }
    if (project.type !== "codebase") {
      return {
        error: {
          error: "Filesystem is only available for codebase projects",
          code: "fs_requires_codebase",
        },
        status: 400 as const,
      };
    }
    if (!project.localWorkingDirectory?.trim()) {
      return {
        error: {
          error: "No local working directory linked to this project",
          code: "fs_working_directory_missing",
        },
        status: 400 as const,
      };
    }
    return { project };
  }

  app.get("/api/v1/projects/:id/docs", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      projectId,
    );
    if ("error" in loaded) {
      return c.json(loaded.error, loaded.status);
    }
    try {
      const result = await projectFsService.listRepoDocs(
        loaded.project.localWorkingDirectory!,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof projectFsService.ProjectFsError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/fs/entries", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      projectId,
    );
    if ("error" in loaded) {
      return c.json(loaded.error, loaded.status);
    }
    try {
      const result = await projectFsService.listEntries(
        loaded.project.localWorkingDirectory!,
        c.req.query("path") ?? "",
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof projectFsService.ProjectFsError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/location-fs", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const parsed = locationFsListQuerySchema.safeParse({
      target: c.req.query("target"),
      path: c.req.query("path"),
      projectId: c.req.query("projectId"),
    });
    if (!parsed.success) {
      return c.json(
        { error: "Invalid location-fs query", code: "bad_request" },
        400,
      );
    }
    let projectKey: string | undefined;
    let vaultRoot: string | undefined;
    if (parsed.data.target === "local") {
      const projectId = await routeProjectId(
        auth.workspaceId,
        parsed.data.projectId!,
      );
      if (!projectId) return c.json(notFound("Project"), 404);
      const project = await taskProjectService.getProjectById(
        auth.workspaceId,
        projectId,
      );
      if (!project) return c.json(notFound("Project"), 404);
      projectKey = project.key;
      try {
        vaultRoot = await resolveVaultPath();
      } catch {
        return c.json(
          {
            error: "Local vault is not configured on this host",
            code: "fs_vault_missing",
          },
          400,
        );
      }
    }
    try {
      const result = await locationFsService.listLocationFs(
        parsed.data.target,
        parsed.data.path,
        { vaultRoot },
        { projectKey },
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof locationFsService.LocationFsError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.post(
    "/api/v1/location-fs/folders",
    zValidator("json", locationFsCreateFolderSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const body = c.req.valid("json");
      let projectKey: string | undefined;
      let vaultRoot: string | undefined;
      if (body.target === "local") {
        const projectId = await routeProjectId(
          auth.workspaceId,
          body.projectId!,
        );
        if (!projectId) return c.json(notFound("Project"), 404);
        const project = await taskProjectService.getProjectById(
          auth.workspaceId,
          projectId,
        );
        if (!project) return c.json(notFound("Project"), 404);
        projectKey = project.key;
        try {
          vaultRoot = await resolveVaultPath();
        } catch {
          return c.json(
            {
              error: "Local vault is not configured on this host",
              code: "fs_vault_missing",
            },
            400,
          );
        }
      }
      try {
        const result = await locationFsService.createLocationFsFolder(
          body.target,
          body.parent,
          body.name,
          { vaultRoot },
          { projectKey },
        );
        return c.json(result, 201);
      } catch (error) {
        if (error instanceof locationFsService.LocationFsError) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/projects/:id/fs/file", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const filePath = c.req.query("path")?.trim();
    if (!filePath) {
      return c.json(
        { error: "path query is required", code: "bad_request" },
        400,
      );
    }
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      projectId,
    );
    if ("error" in loaded) {
      return c.json(loaded.error, loaded.status);
    }
    try {
      const result = await projectFsService.readTextFile(
        loaded.project.localWorkingDirectory!,
        filePath,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof projectFsService.ProjectFsError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.put(
    "/api/v1/projects/:id/fs/file",
    zValidator("json", projectFsWriteFileSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const projectIdRaw = c.req.param("id");
      const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
      if (!projectId) return c.json(notFound("Project"), 404);
      const body = c.req.valid("json");
      const loaded = await loadCodebaseFsProject(
        auth.workspaceId,
        projectId,
      );
      if ("error" in loaded) {
        return c.json(loaded.error, loaded.status);
      }
      try {
        const result = await projectFsService.writeTextFile(
          loaded.project.localWorkingDirectory!,
          body.path,
          body.content,
        );
        return c.json(result);
      } catch (error) {
        if (error instanceof projectFsService.ProjectFsError) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/v1/projects/:id/fs/entries",
    zValidator("json", projectFsCreateEntrySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("projects:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const projectIdRaw = c.req.param("id");
      const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
      if (!projectId) return c.json(notFound("Project"), 404);
      const body = c.req.valid("json");
      const loaded = await loadCodebaseFsProject(
        auth.workspaceId,
        projectId,
      );
      if ("error" in loaded) {
        return c.json(loaded.error, loaded.status);
      }
      try {
        const result = await projectFsService.createEntry(
          loaded.project.localWorkingDirectory!,
          body.parent,
          body.name,
          body.kind,
        );
        return c.json(result, 201);
      } catch (error) {
        if (error instanceof projectFsService.ProjectFsError) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/projects/:id/fs/entries", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const entryPath = c.req.query("path")?.trim();
    if (!entryPath) {
      return c.json(
        { error: "path query is required", code: "bad_request" },
        400,
      );
    }
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      projectId,
    );
    if ("error" in loaded) {
      return c.json(loaded.error, loaded.status);
    }
    try {
      const result = await projectFsService.deleteEntry(
        loaded.project.localWorkingDirectory!,
        entryPath,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof projectFsService.ProjectFsError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });
}
