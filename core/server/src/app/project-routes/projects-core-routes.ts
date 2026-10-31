import {
  ListQueryError,
  PROJECTS_LIST_PAGINATED_ONLY_KEYS,
  buildProjectRestPayload,
  can,
  circleService,
  collectQueryParams,
  commitRestEntityWrite,
  createProjectSchema,
  forbidden,
  getAuth,
  ignoredLegacyListKeys,
  isAgentPersonaAuth,
  isRestLeaderFirstWrite,
  listQueryErrorBody,
  newId,
  notFound,
  parseProjectsListQuery,
  projectVaultService,
  publishProjectLive,
  recordProjectRestSyncEvent,
  requireResolvedRef,
  requireScope,
  routeProjectId,
  taskProjectService,
  toProject,
  unauthorized,
  updateProjectSchema,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";
import {
  CHANNEL_CONNECT_WEBHOOK_EVENT,
  postChannelConnectWebhook,
} from "../../lib/channel-connect-webhook.js";

/** Projects CRUD, vault and relations. */
export function registerProjectCoreRoutes(app: Hono) {
  app.get("/api/v1/projects", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseProjectsListQuery(raw);
      parsed = {
        ...parsed,
        organizationId: await requireResolvedRef(
          auth.workspaceId,
          parsed.organizationId,
          "organizationId",
        ),
      };
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      const ignored = ignoredLegacyListKeys(
        raw,
        PROJECTS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      const rows = await taskProjectService.listProjects(auth.workspaceId, {
        organizationId: parsed.organizationId,
        area: parsed.area,
        status: parsed.status,
        type: parsed.type,
      });
      return c.json({ projects: rows.map(toProject) });
    }

    const result = await taskProjectService.listProjectsPaginated(
      auth.workspaceId,
      parsed,
    );
    return c.json({
      items: result.items.map(toProject),
      nextCursor: result.nextCursor,
    });
  });

  app.get("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);

    const row = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!row) {
      return c.json(notFound("Project"), 404);
    }

    // Vault folder + .cursor skills: never block the detail response. Awaiting
    // ensure here hung GET /projects/{id} when vault FS stalled (OS-68), while
    // list/tasks stayed fast. Dedicated POST …/ensure-vault remains available.
    void projectVaultService
      .ensureProjectVaultFoldersOnly(auth.workspaceId, projectId)
      .catch(() => null);

    c.header("Cache-Control", "no-store");
    return c.json(toProject(row));
  });

  app.post("/api/v1/projects/:id/ensure-vault", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
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

    const ensured = await projectVaultService.tryEnsureProjectVaultWorkspace(
      auth.workspaceId,
      projectId,
    );
    if (!ensured) {
      return c.json({
        projectId: project.id,
        projectKey: project.key,
        projectVaultPath: "",
        localWorkingDirectory: project.localWorkingDirectory ?? null,
        assignedWorkingDirectory: false,
        createdSkill: false,
        configured: false,
      });
    }

    return c.json({
      ...ensured,
      configured: true,
    });
  });

  app.get("/api/v1/projects/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const projectId = await routeProjectId(auth.workspaceId, c.req.param("id"));
    if (!projectId) return c.json(notFound("Project"), 404);
    const result = await circleService.getProjectRelations(auth.workspaceId, projectId);
    return result ? c.json(result) : c.json(notFound("Project"), 404);
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
        const body = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const projectId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "project",
            entityId: projectId,
            operation: "upsert",
            payload: buildProjectRestPayload(projectId, body),
          });
          const row = await taskProjectService.getProjectById(
            auth.workspaceId,
            projectId,
          );
          if (!row) {
            throw new Error("PROJECT_CREATE_FAILED");
          }
          publishProjectLive(auth, row.id, "upsert");
          return c.json(toProject(row), 201);
        }
        const row = await taskProjectService.createProject(
          auth.workspaceId,
          body,
        );
        await recordProjectRestSyncEvent(auth.workspaceId, row, "upsert");
        publishProjectLive(auth, row.id, "upsert");
        return c.json(toProject(row), 201);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_KEY_EXISTS") {
          return c.json(
            { error: "Project key already exists", code: "project_key_exists" },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "GITHUB_REPO_REQUIRES_CODEBASE"
        ) {
          return c.json(
            {
              error: "GitHub repository can only be set on codebase projects",
              code: "github_repo_requires_codebase",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "LOCATION_REQUIRES_CODEBASE"
        ) {
          return c.json(
            {
              error:
                "Development, production, and local locations can only be set on codebase projects",
              code: "location_requires_codebase",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "CHANNEL_INVALID"
        ) {
          return c.json(
            {
              error:
                "Channel must be { uri, name? } with a valid uri (e.g. grokbot://app/v1/agent?id=<uuid>)",
              code: "channel_invalid",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "CHANNEL_PENDING_LINK_INVALID"
        ) {
          return c.json(
            {
              error:
                "channelPendingLink must be backsteros://chat/<threadId>?message=<id> or /chat/<threadId>?message=<id>",
              code: "channel_pending_link_invalid",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "LEAD_AGENT_CONTACT_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Lead agent contact not found",
              code: "lead_agent_contact_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "LEAD_AGENT_NOT_AGENT"
        ) {
          return c.json(
            {
              error:
                "Lead agent must be a contact linked to an enabled agent persona",
              code: "lead_agent_not_agent",
            },
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
        const projectIdRaw = c.req.param("id");
        const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
        if (!projectId) return c.json(notFound("Project"), 404);
        const patch = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const existing = await taskProjectService.getProjectById(
            auth.workspaceId,
            projectId,
          );
          if (!existing) {
            return c.json(notFound("Project"), 404);
          }
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "project",
            entityId: projectId,
            operation: "upsert",
            payload: buildProjectRestPayload(projectId, patch),
          });
          const row = await taskProjectService.getProjectById(
            auth.workspaceId,
            projectId,
          );
          // Echo request fields onto the response so clients do not briefly
          // see a pre-replication row (notably localWorkingDirectory).
          const body = toProject(row!);
          for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined && Object.prototype.hasOwnProperty.call(body, key)) {
              (body as Record<string, unknown>)[key] = value;
            }
          }
          publishProjectLive(auth, projectId, "upsert");
          return c.json(body);
        }
        const row = await taskProjectService.updateProject(
          auth.workspaceId,
          projectId,
          patch,
        );
        if (!row) {
          return c.json(notFound("Project"), 404);
        }
        await recordProjectRestSyncEvent(auth.workspaceId, row, "upsert");
        publishProjectLive(auth, row.id, "upsert");
        return c.json(toProject(row));
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_KEY_EXISTS") {
          return c.json(
            { error: "Project key already exists", code: "project_key_exists" },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "PROJECT_VAULT_TARGET_EXISTS"
        ) {
          return c.json(
            {
              error:
                "Could not rename project folder — a non-empty vault folder already exists for the new key",
              code: "project_vault_target_exists",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "GITHUB_REPO_REQUIRES_CODEBASE"
        ) {
          return c.json(
            {
              error: "GitHub repository can only be set on codebase projects",
              code: "github_repo_requires_codebase",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "LOCATION_REQUIRES_CODEBASE"
        ) {
          return c.json(
            {
              error:
                "Development, production, and local locations can only be set on codebase projects",
              code: "location_requires_codebase",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "CHANNEL_INVALID"
        ) {
          return c.json(
            {
              error:
                "Channel must be { uri, name? } with a valid uri (e.g. grokbot://app/v1/agent?id=<uuid>)",
              code: "channel_invalid",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "CHANNEL_CONNECT_VIA_ENDPOINT"
        ) {
          return c.json(
            {
              error:
                "Use POST /api/v1/projects/:id/channel/connect to start Channel Connect (owner only)",
              code: "channel_connect_via_endpoint",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "CHANNEL_PENDING_LINK_REQUIRED"
        ) {
          return c.json(
            {
              error:
                "channelPendingLink is required when channelStatus is needs_details",
              code: "channel_pending_link_required",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "CHANNEL_PENDING_LINK_INVALID"
        ) {
          return c.json(
            {
              error:
                "channelPendingLink must be backsteros://chat/<threadId>?message=<id> or /chat/<threadId>?message=<id>",
              code: "channel_pending_link_invalid",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "LEAD_AGENT_CONTACT_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Lead agent contact not found",
              code: "lead_agent_contact_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "LEAD_AGENT_NOT_AGENT"
        ) {
          return c.json(
            {
              error:
                "Lead agent must be a contact linked to an enabled agent persona",
              code: "lead_agent_not_agent",
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  /**
   * Owner-only Channel Connect: set status=connecting and POST the outbound
   * webhook for Niels's Grok Bot routine. Agents cannot call this.
   */
  app.post("/api/v1/projects/:id/channel/connect", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (isAgentPersonaAuth(auth)) {
      return c.json(
        {
          error: "Only the owner can start Channel Connect",
          code: "channel_connect_owner_only",
        },
        403,
      );
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);

    const row = await taskProjectService.beginProjectChannelConnect(
      auth.workspaceId,
      projectId,
    );
    if (!row) return c.json(notFound("Project"), 404);

    const requestedAt =
      row.channelRequestedAt?.toISOString() ?? new Date().toISOString();
    const webhook = await postChannelConnectWebhook({
      workspaceId: auth.workspaceId,
      payload: {
        event: CHANNEL_CONNECT_WEBHOOK_EVENT,
        projectId: row.id,
        projectKey: row.key,
        projectName: row.name,
        type: row.type,
        requestedAt,
        leadAgentContactId: row.leadAgentContactId ?? null,
      },
    });

    let syncWarning: string | null = null;
    try {
      await recordProjectRestSyncEvent(auth.workspaceId, row, "upsert");
    } catch (error) {
      // Never 500 the Connect UI on twin/leader forward failure — local row
      // already has connecting; peer catches up on the next tick.
      syncWarning =
        error instanceof Error
          ? error.message
          : "Could not replicate Channel Connect status to peer";
    }
    publishProjectLive(auth, row.id, "upsert");

    const body = toProject(row);
    const warning = !webhook.ok
      ? webhook.error
      : syncWarning
        ? `Channel Connect saved locally, but peer sync failed: ${syncWarning}`
        : null;
    if (warning) {
      return c.json(
        {
          ...body,
          channelConnectWarning: warning,
        },
        200,
      );
    }
    return c.json(body);
  });

  app.delete("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getProjectById(
        auth.workspaceId,
        projectId,
      );
      if (!existing) {
        return c.json(notFound("Project"), 404);
      }
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "project",
        entityId: projectId,
        operation: "delete",
        payload: { id: projectId },
      });
      publishProjectLive(auth, projectId, "delete");
      return c.body(null, 204);
    }
    const row = await taskProjectService.deleteProject(
      auth.workspaceId,
      projectId,
    );
    if (!row) {
      return c.json(notFound("Project"), 404);
    }
    await recordProjectRestSyncEvent(auth.workspaceId, row, "delete");
    publishProjectLive(auth, row.id, "delete");
    return c.body(null, 204);
  });
}
