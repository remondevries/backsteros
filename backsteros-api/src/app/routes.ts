import type { Context, Hono, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  createApiKeySchema,
  createDocumentSchema,
  createProjectSchema,
  createTaskSchema,
  createTaskCommentSchema,
  createTaskActivitySchema,
  reorderLetterAttachmentsSchema,
  updateApiKeySchema,
  updateDocumentContentSchema,
  updateDocumentSchema,
  updateProjectSchema,
  updateTaskSchema,
  updateTaskCommentSchema,
} from "@backsteros/contracts";

import {
  toApiKey,
  toDocument,
  toProject,
  toSearchResult,
  toTask,
  toTaskActivity,
  toTaskComment,
} from "../lib/mappers.js";
import type { AuthContext } from "../middleware/auth.js";
import { requireScope, resolveAuth } from "../middleware/auth.js";
import { isSpacesConfigured } from "../lib/storage.js";
import {
  normalizeAvatarMimeType,
  resolveAvatarContentType,
  sniffAvatarContentType,
} from "../lib/avatar-content-type.js";
import { MAX_AVATAR_BYTES } from "../lib/upload-limits.js";
import * as apiKeyService from "../services/api-keys.js";
import * as documentService from "../services/documents.js";
import * as circleService from "../services/circle-domain.js";
import * as githubService from "../services/github.js";
import * as taskActivityService from "../services/task-activities.js";
import * as taskCommentService from "../services/task-comments.js";
import * as taskProjectService from "../services/tasks-projects.js";

const idListSchema = z.object({ ids: z.array(z.string()).min(1).max(500) });
const reorderSchema = z.object({ orderedIds: z.array(z.string()).min(1).max(500) });
const organizationSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  summary: z.string().max(2000).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().max(20_000).nullable().optional(),
});
const contactSocialAccountSchema = z.object({
  platform: z.string().min(1).max(64),
  url: z.string().min(1).max(500),
});
const contactSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  organizationId: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  email: z.string().email().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  phone: z.string().max(64).nullable().optional(),
  role: z.string().max(255).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema).max(20).optional(),
});
const areaSchema = z.object({
  name: z.string().min(1).max(255),
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
const letterSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  projectId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  title: z.string().min(1).max(500),
  icon: z.string().max(128).nullable().optional(),
  context: z.string().max(20_000).nullable().optional(),
  status: z.enum(["triage", "backlog", "ready_to_start", "in_progress", "on_hold", "in_review", "completed", "canceled", "duplicated"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  receivedDate: z.string().datetime().nullable().optional(),
  direction: z.enum(["incoming", "outgoing"]).optional(),
  originalFilename: z.string().max(255).optional(),
  extractedText: z.string().max(2_000_000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

function can(auth: AuthContext, scope: Parameters<typeof requireScope>[0]) {
  return requireScope(scope)(auth);
}

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
  if (
    c.req.path.startsWith("/api/v1/sync") ||
    c.req.path.startsWith("/api/v1/powersync")
  ) {
    await next();
    return;
  }

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

    const rows = await taskProjectService.listProjects(auth.workspaceId, {
      organizationId: c.req.query("organizationId"),
      area: c.req.query("area"),
      status: c.req.query("status"),
      type: c.req.query("type"),
    });
    return c.json({ projects: rows.map(toProject) });
  });

  app.get("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.getProjectById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Project"), 404);
    }

    return c.json(toProject(row));
  });

  app.get("/api/v1/projects/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const result = await circleService.getProjectRelations(auth.workspaceId, c.req.param("id"));
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
        const row = await taskProjectService.createProject(
          auth.workspaceId,
          c.req.valid("json"),
        );
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
          auth.workspaceId,
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
        throw error;
      }
    },
  );

  app.delete("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.deleteProject(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Project"), 404);
    }

    return c.body(null, 204);
  });

  app.get("/api/v1/github/repositories", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (auth.kind !== "clerk" || !auth.clerkUserId) {
      return c.json(
        {
          error: "GitHub integration requires signing in with Clerk",
          code: "clerk_required",
        },
        403,
      );
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    try {
      const token = await githubService.getGithubAccessToken(auth.clerkUserId);
      const repositories = await githubService.listUserRepositories(token);
      return c.json({ repositories });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/branches", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (auth.kind !== "clerk" || !auth.clerkUserId) {
      return c.json(
        {
          error: "GitHub integration requires signing in with Clerk",
          code: "clerk_required",
        },
        403,
      );
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await githubService.getGithubAccessToken(auth.clerkUserId);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const [repository, branches] = await Promise.all([
        githubService.getRepository(token, owner, repo),
        githubService.listRepositoryBranches(token, owner, repo),
      ]);
      return c.json({
        repository: project.githubRepository,
        defaultBranch: repository.defaultBranch,
        branches,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/commits", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (auth.kind !== "clerk" || !auth.clerkUserId) {
      return c.json(
        {
          error: "GitHub integration requires signing in with Clerk",
          code: "clerk_required",
        },
        403,
      );
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const branch = c.req.query("branch")?.trim();
    if (!branch) {
      return c.json(
        { error: "branch query parameter is required", code: "bad_request" },
        400,
      );
    }
    const pageRaw = c.req.query("page");
    const page = pageRaw ? Number(pageRaw) : 1;
    if (!Number.isInteger(page) || page < 1) {
      return c.json(
        { error: "Invalid page", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await githubService.getGithubAccessToken(auth.clerkUserId);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const result = await githubService.listRepositoryCommits(
        token,
        owner,
        repo,
        { sha: branch, page },
      );
      return c.json({
        repository: project.githubRepository,
        branch,
        page: result.page,
        hasMore: result.hasMore,
        commits: result.commits,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/tasks", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const rows = await taskProjectService.listTasks(auth.workspaceId, {
      projectId: c.req.query("projectId"),
      contactId: c.req.query("contactId"),
      assigneeId: c.req.query("assigneeId"),
      status: c.req.query("status"),
      inbox:
        c.req.query("inbox") === undefined
          ? undefined
          : c.req.query("inbox") === "true",
    });
    return c.json({ tasks: rows.map(toTask) });
  });

  // Static task collection routes must be registered before /tasks/:id.
  app.get("/api/v1/tasks/due", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const beforeValue = c.req.query("before");
    const before = beforeValue ? new Date(beforeValue) : new Date();
    if (Number.isNaN(before.getTime())) {
      return c.json({ error: "Invalid before date", code: "bad_request" }, 400);
    }
    const rows = await taskProjectService.listDueTasks(auth.workspaceId, before);
    return c.json({ tasks: rows.map(toTask) });
  });

  app.get("/api/v1/tasks/inbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const rows = await taskProjectService.listInboxTasks(auth.workspaceId);
    return c.json({ tasks: rows.map(toTask) });
  });

  app.get("/api/v1/tasks/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await taskProjectService.getTaskById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Task"), 404);
    }

    return c.json(toTask(row));
  });

  app.get("/api/v1/tasks/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const result = await circleService.getTaskRelations(auth.workspaceId, c.req.param("id"));
    return result ? c.json(result) : c.json(notFound("Task"), 404);
  });

  app.get("/api/v1/tasks/:id/comments", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const rows = await taskCommentService.listTaskComments(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!rows) return c.json(notFound("Task"), 404);
    return c.json({ comments: rows.map(toTaskComment) });
  });

  app.get("/api/v1/tasks/:id/activities", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const rows = await taskActivityService.listTaskActivities(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!rows) return c.json(notFound("Task"), 404);
    return c.json({ activities: rows.map(toTaskActivity) });
  });

  app.post(
    "/api/v1/tasks/:id/activities",
    zValidator("json", createTaskActivitySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const body = c.req.valid("json");
      const row = await taskActivityService.createClientTaskActivity(
        auth.workspaceId,
        c.req.param("id"),
        body.type,
        body.data,
      );
      if (!row) return c.json(notFound("Task"), 404);
      return c.json(toTaskActivity(row), 201);
    },
  );

  app.post(
    "/api/v1/tasks/:id/comments",
    zValidator("json", createTaskCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const row = await taskCommentService.createTaskComment(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
        { userId: auth.userId },
      );
      if (!row) return c.json(notFound("Task"), 404);
      return c.json(toTaskComment(row), 201);
    },
  );

  app.patch(
    "/api/v1/tasks/:taskId/comments/:id",
    zValidator("json", updateTaskCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const row = await taskCommentService.updateTaskComment(
        auth.workspaceId,
        c.req.param("taskId"),
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!row) return c.json(notFound("Comment"), 404);
      return c.json(toTaskComment(row));
    },
  );

  app.delete("/api/v1/tasks/:taskId/comments/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const ok = await taskCommentService.deleteTaskComment(
      auth.workspaceId,
      c.req.param("taskId"),
      c.req.param("id"),
    );
    if (!ok) return c.json(notFound("Comment"), 404);
    return c.body(null, 204);
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
        const row = await taskProjectService.createTask(
          auth.workspaceId,
          c.req.valid("json"),
          undefined,
          undefined,
          { userId: auth.userId },
        );
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
        const body = c.req.valid("json");
        const { activityActor, ...patch } = body;
        const row = await taskProjectService.updateTask(
          auth.workspaceId,
          c.req.param("id"),
          patch,
          undefined,
          {
            userId: auth.userId,
            kind: activityActor === "agent" ? "agent" : "user",
          },
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

    const row = await taskProjectService.deleteTask(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Task"), 404);
    }

    return c.body(null, 204);
  });

  app.get("/api/v1/documents", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const type = c.req.query("type");
    const projectId = c.req.query("projectId");
    const rows = await documentService.listDocuments(auth.workspaceId, {
      type: type as "project" | "knowledge" | "journal" | undefined,
      projectId,
    });
    return c.json({ documents: rows.map(toDocument) });
  });

  app.get("/api/v1/documents/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await documentService.getDocumentById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Document"), 404);
    }

    return c.json(toDocument(row));
  });

  app.post(
    "/api/v1/documents",
    zValidator("json", createDocumentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await documentService.createDocument(
          auth.workspaceId,
          c.req.valid("json"),
        );
        return c.json(toDocument(row), 201);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        if (error instanceof Error && error.message === "DOCUMENT_PATH_EXISTS") {
          return c.json(
            { error: "Document path already exists", code: "document_path_exists" },
            400,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Object storage access denied — check Spaces key write permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/documents/:id",
    zValidator("json", updateDocumentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await documentService.updateDocument(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("Document"), 404);
        }
        return c.json(toDocument(row));
      } catch (error) {
        if (error instanceof Error && error.message === "DOCUMENT_PATH_EXISTS") {
          return c.json(
            { error: "Document path already exists", code: "document_path_exists" },
            400,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Object storage access denied — check Spaces key write permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/documents/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const row = await documentService.deleteDocument(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("Document"), 404);
    }

    return c.body(null, 204);
  });

  app.get("/api/v1/documents/:id/content", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    try {
      const result = await documentService.getDocumentContent(
        auth.workspaceId,
        c.req.param("id"),
      );
      if (!result) {
        return c.json(notFound("Document"), 404);
      }

      return c.json({
        content: result.content,
        contentType: result.row.contentType,
        contentVersion: result.row.contentVersion,
        byteSize: result.row.byteSize,
        checksum: result.row.checksum,
        updatedAt: result.row.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "STORAGE_OBJECT_NOT_FOUND") {
        return c.json(
          { error: "Document content not found in storage", code: "storage_not_found" },
          404,
        );
      }
      throw error;
    }
  });

  app.patch(
    "/api/v1/documents/:id/content",
    zValidator("json", updateDocumentContentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const row = await documentService.updateDocumentContent(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("Document"), 404);
        }

        return c.json({
          content: c.req.valid("json").content,
          contentType: row.contentType,
          contentVersion: row.contentVersion,
          byteSize: row.byteSize,
          checksum: row.checksum,
          updatedAt: row.updatedAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
          return c.json(
            {
              error: "Document content version conflict",
              code: "content_version_conflict",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Object storage access denied — check Spaces key write permissions",
              code: "storage_access_denied",
            },
            503,
          );
        }
        throw error;
      }
    },
  );

  app.post("/api/v1/tasks/batch", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const body = await c.req.json();
    const ids = idListSchema.safeParse(body);
    const patch = updateTaskSchema.safeParse(body.patch);
    if (!ids.success || !patch.success) {
      return c.json({ error: "Invalid batch update", code: "bad_request" }, 400);
    }
    const rows = await taskProjectService.batchUpdateTasks(
      auth.workspaceId,
      ids.data.ids,
      patch.data,
      { userId: auth.userId },
    );
    return c.json({ tasks: rows.map(toTask) });
  });

  app.post(
    "/api/v1/tasks/reorder",
    zValidator("json", reorderSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const rows = await taskProjectService.reorderTasks(
        auth.workspaceId,
        c.req.valid("json").orderedIds,
      );
      return c.json({ tasks: rows.map(toTask) });
    },
  );

  app.post("/api/v1/tasks/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z.object({ projectId: z.string().nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid projectId", code: "bad_request" }, 400);
    const row = await taskProjectService.updateTask(
      auth.workspaceId,
      c.req.param("id"),
      { projectId: parsed.data.projectId, inbox: parsed.data.projectId === null },
      undefined,
      { userId: auth.userId },
    );
    if (!row) return c.json(notFound("Task"), 404);
    return c.json(toTask(row));
  });

  app.post("/api/v1/tasks/:id/triage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z
      .object({ projectId: z.string().nullable().optional(), status: z.string().optional() })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid triage data", code: "bad_request" }, 400);
    const row = await taskProjectService.updateTask(
      auth.workspaceId,
      c.req.param("id"),
      {
        projectId: parsed.data.projectId,
        status: parsed.data.status as never,
        triagedAt: new Date().toISOString(),
        inbox: false,
      },
      undefined,
      { userId: auth.userId },
    );
    if (!row) return c.json(notFound("Task"), 404);
    return c.json(toTask(row));
  });

  app.get("/api/v1/journal/:date", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    const parsed = z.string().date().safeParse(c.req.param("date"));
    if (!parsed.success) return c.json({ error: "Invalid journal date", code: "bad_request" }, 400);
    let row = await documentService.getJournalDocument(auth.workspaceId, parsed.data);
    if (!row) {
      if (!can(auth, "documents:write")) return c.json(notFound("Journal entry"), 404);
      row = await documentService.getOrCreateJournalDocument(auth.workspaceId, parsed.data);
    }
    return c.json(toDocument(row));
  });

  app.post(
    "/api/v1/documents/reorder",
    zValidator("json", reorderSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "documents:write")) return c.json(forbidden(), 403);
      const rows = await documentService.reorderDocuments(
        auth.workspaceId,
        c.req.valid("json").orderedIds,
      );
      return c.json({ documents: rows.map(toDocument) });
    },
  );

  app.post("/api/v1/documents/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:write")) return c.json(forbidden(), 403);
    const parsed = z.object({ parentId: z.string().nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid parentId", code: "bad_request" }, 400);
    const row = await documentService.moveDocument(
      auth.workspaceId,
      c.req.param("id"),
      parsed.data.parentId,
    );
    if (!row) return c.json(notFound("Document"), 404);
    return c.json(toDocument(row));
  });

  app.get("/api/v1/organizations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    return c.json({ organizations: await circleService.listOrganizations(auth.workspaceId) });
  });
  app.get("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const row = await circleService.getOrganizationById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(row) : c.json(notFound("Organization"), 404);
  });
  app.get("/api/v1/organizations/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const result = await circleService.getOrganizationRelations(auth.workspaceId, c.req.param("id"));
    return result ? c.json(result) : c.json(notFound("Organization"), 404);
  });
  app.post("/api/v1/organizations", zValidator("json", organizationSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    return c.json(await circleService.createOrganization(auth.workspaceId, c.req.valid("json")), 201);
  });
  app.patch("/api/v1/organizations/:id", zValidator("json", organizationSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const row = await circleService.updateOrganization(auth.workspaceId, c.req.param("id"), c.req.valid("json"));
    return row ? c.json(row) : c.json(notFound("Organization"), 404);
  });
  app.delete("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const row = await circleService.deleteOrganization(auth.workspaceId, c.req.param("id"));
    return row ? c.body(null, 204) : c.json(notFound("Organization"), 404);
  });

  app.get("/api/v1/contacts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    return c.json({ contacts: await circleService.listContacts(auth.workspaceId, {
      organizationId: c.req.query("organizationId"),
      q: c.req.query("q"),
    }) });
  });
  app.get("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const row = await circleService.getContactById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(row) : c.json(notFound("Contact"), 404);
  });
  app.get("/api/v1/contacts/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const result = await circleService.getContactRelations(auth.workspaceId, c.req.param("id"));
    return result ? c.json(result) : c.json(notFound("Contact"), 404);
  });
  app.post("/api/v1/contacts", zValidator("json", contactSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    return c.json(await circleService.createContact(auth.workspaceId, c.req.valid("json")), 201);
  });
  app.patch("/api/v1/contacts/:id", zValidator("json", contactSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const row = await circleService.updateContact(auth.workspaceId, c.req.param("id"), c.req.valid("json"));
    return row ? c.json(row) : c.json(notFound("Contact"), 404);
  });
  app.delete("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const row = await circleService.deleteContact(auth.workspaceId, c.req.param("id"));
    return row ? c.body(null, 204) : c.json(notFound("Contact"), 404);
  });

  app.get("/api/v1/areas", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    return c.json({ areas: await circleService.listAreas(auth.workspaceId) });
  });
  app.get("/api/v1/areas/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const row = await circleService.getAreaById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(row) : c.json(notFound("Area"), 404);
  });
  app.post("/api/v1/areas", zValidator("json", areaSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    return c.json(await circleService.createArea(auth.workspaceId, c.req.valid("json")), 201);
  });
  app.patch("/api/v1/areas/:id", zValidator("json", areaSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const row = await circleService.updateArea(auth.workspaceId, c.req.param("id"), c.req.valid("json"));
    return row ? c.json(row) : c.json(notFound("Area"), 404);
  });
  app.delete("/api/v1/areas/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const row = await circleService.deleteArea(auth.workspaceId, c.req.param("id"));
    return row ? c.body(null, 204) : c.json(notFound("Area"), 404);
  });

  app.get("/api/v1/letters", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    return c.json({ letters: await circleService.listLetters(auth.workspaceId, {
      projectId: c.req.query("projectId"),
      organizationId: c.req.query("organizationId"),
      contactId: c.req.query("contactId"),
      status: c.req.query("status"),
      triage: c.req.query("triage") === "true",
    }) });
  });
  app.get("/api/v1/letters/inbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    return c.json({ letters: await circleService.listLetters(auth.workspaceId, { triage: true }) });
  });
  app.get("/api/v1/letters/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const row = await circleService.getLetterById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(row) : c.json(notFound("Letter"), 404);
  });
  app.get("/api/v1/letters/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const result = await circleService.getLetterRelations(auth.workspaceId, c.req.param("id"));
    return result ? c.json(result) : c.json(notFound("Letter"), 404);
  });
  app.post("/api/v1/letters", zValidator("json", letterSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    return c.json(await circleService.createLetter(auth.workspaceId, c.req.valid("json")), 201);
  });
  app.patch("/api/v1/letters/:id", zValidator("json", letterSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const row = await circleService.updateLetter(auth.workspaceId, c.req.param("id"), c.req.valid("json"));
    return row ? c.json(row) : c.json(notFound("Letter"), 404);
  });
  app.delete("/api/v1/letters/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const row = await circleService.deleteLetter(auth.workspaceId, c.req.param("id"));
    return row ? c.body(null, 204) : c.json(notFound("Letter"), 404);
  });
  app.post("/api/v1/letters/:id/triage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const parsed = letterSchema.pick({
      projectId: true,
      organizationId: true,
      contactId: true,
      status: true,
      dueDate: true,
    }).partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid triage data", code: "bad_request" }, 400);
    const row = await circleService.triageLetter(auth.workspaceId, c.req.param("id"), parsed.data);
    return row ? c.json(row) : c.json(notFound("Letter"), 404);
  });
  app.put("/api/v1/letters/:id/pdf", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000) {
      return c.json({ error: "PDF must be between 1 byte and 25 MB", code: "bad_request" }, 400);
    }
    const row = await circleService.putLetterPdf(
      auth.workspaceId,
      c.req.param("id"),
      bytes,
      c.req.header("X-Filename") ?? "letter.pdf",
    );
    return row ? c.json(row) : c.json(notFound("Letter"), 404);
  });
  app.get("/api/v1/letters/:id/pdf", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const result = await circleService.getLetterPdf(auth.workspaceId, c.req.param("id"));
    if (!result) return c.json(notFound("PDF"), 404);
    c.header("Content-Type", result.row.contentType);
    c.header("Content-Disposition", `inline; filename="${(result.row.originalFilename || "letter.pdf").replaceAll('"', "")}"`);
    return c.body(Uint8Array.from(result.bytes).buffer);
  });
  app.get("/api/v1/letters/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const attachments = await circleService.listLetterAttachments(
      auth.workspaceId,
      c.req.param("id"),
    );
    return attachments
      ? c.json({ attachments })
      : c.json(notFound("Letter"), 404);
  });
  app.post("/api/v1/letters/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000) {
      return c.json({ error: "PDF must be between 1 byte and 25 MB", code: "bad_request" }, 400);
    }
    const result = await circleService.createLetterAttachment(
      auth.workspaceId,
      c.req.param("id"),
      bytes,
      c.req.header("X-Filename") ?? "letter.pdf",
    );
    return result
      ? c.json(result.attachment, 201)
      : c.json(notFound("Letter"), 404);
  });
  app.post(
    "/api/v1/letters/:id/attachments/reorder",
    zValidator("json", reorderLetterAttachmentsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
      try {
        const rows = await circleService.reorderLetterAttachments(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json").orderedIds,
        );
        if (!rows) return c.json(notFound("Letter"), 404);
        return c.json({ attachments: rows });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "ATTACHMENT_NOT_FOUND" ||
            error.message === "ATTACHMENT_IDS_INVALID")
        ) {
          return c.json(
            { error: "Invalid attachment order", code: "bad_request" },
            400,
          );
        }
        throw error;
      }
    },
  );
  app.get("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const result = await circleService.getLetterAttachment(
      auth.workspaceId,
      c.req.param("id"),
      c.req.param("attachmentId"),
    );
    if (!result) return c.json(notFound("PDF"), 404);
    c.header("Content-Type", result.row.contentType);
    c.header(
      "Content-Disposition",
      `inline; filename="${(result.row.originalFilename || "letter.pdf").replaceAll('"', "")}"`,
    );
    return c.body(Uint8Array.from(result.bytes).buffer);
  });
  app.patch("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({ originalFilename: z.string().trim().min(1).max(255) })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "originalFilename is required", code: "bad_request" },
        400,
      );
    }
    const row = await circleService.updateLetterAttachment(
      auth.workspaceId,
      c.req.param("id"),
      c.req.param("attachmentId"),
      parsed.data,
    );
    return row ? c.json(row) : c.json(notFound("PDF"), 404);
  });
  app.delete("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const row = await circleService.deleteLetterAttachment(
      auth.workspaceId,
      c.req.param("id"),
      c.req.param("attachmentId"),
    );
    return row ? c.json(row) : c.json(notFound("PDF"), 404);
  });

  app.put(
    "/api/v1/avatars/:entityType/:entityId",
    bodyLimit({
      maxSize: MAX_AVATAR_BYTES,
      onError: (c) =>
        c.json(
          { error: "Avatar must be an image up to 5 MB", code: "bad_request" },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "avatars:write")) return c.json(forbidden(), 403);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const contentType =
        sniffAvatarContentType(bytes) ??
        normalizeAvatarMimeType(c.req.header("Content-Type"));
      if (
        !contentType ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_AVATAR_BYTES
      ) {
        return c.json(
          {
            error: "Avatar must be a JPG, PNG, WebP, or GIF up to 5 MB",
            code: "bad_request",
          },
          400,
        );
      }
      return c.json(
        await circleService.putAvatar(
          auth.workspaceId,
          c.req.param("entityType"),
          c.req.param("entityId"),
          bytes,
          contentType,
        ),
      );
    },
  );
  app.get("/api/v1/avatars/:entityType/:entityId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "avatars:read")) return c.json(forbidden(), 403);
    const result = await circleService.getAvatar(auth.workspaceId, c.req.param("entityType"), c.req.param("entityId"));
    if (!result) return c.json(notFound("Avatar"), 404);
    const contentType = resolveAvatarContentType(
      result.row.contentType,
      result.bytes,
    );
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "private, max-age=300");
    const body = Uint8Array.from(result.bytes);
    return c.body(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  });
  app.delete("/api/v1/avatars/:entityType/:entityId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "avatars:write")) return c.json(forbidden(), 403);
    const row = await circleService.deleteAvatar(
      auth.workspaceId,
      c.req.param("entityType"),
      c.req.param("entityId"),
    );
    return row ? c.json(row) : c.json(notFound("Avatar"), 404);
  });

  app.get("/api/v1/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json({ settings: await circleService.getSettings(auth.workspaceId) });
  });
  app.get("/api/v1/settings/storage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json({
      configured: isSpacesConfigured(),
      provider: "digitalocean-spaces",
    });
  });
  app.patch("/api/v1/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = z.record(z.unknown()).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid settings", code: "bad_request" }, 400);
    return c.json({ settings: await circleService.updateSettings(auth.workspaceId, parsed.data) });
  });

  app.get("/api/v1/mentions", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    return c.json({ mentions: await circleService.listMentions(auth.workspaceId, auth.userId) });
  });
  app.post("/api/v1/mentions", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z.object({
      userId: z.string().nullable().optional(),
      sourceType: z.string().min(1).max(64),
      sourceId: z.string().min(1),
      excerpt: z.string().max(1000).optional(),
    }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid mention", code: "bad_request" }, 400);
    return c.json(await circleService.createMention(auth.workspaceId, parsed.data), 201);
  });
  app.post("/api/v1/mentions/:id/read", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const row = await circleService.markMentionRead(auth.workspaceId, c.req.param("id"));
    return row ? c.json(row) : c.json(notFound("Mention"), 404);
  });

  app.get("/api/v1/global-search", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "search:query")) return c.json(forbidden(), 403);
    const q = c.req.query("q");
    if (!q) return c.json({ error: "Query parameter q is required", code: "bad_request" }, 400);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20), 1), 100);
    const modeRaw = c.req.query("mode") ?? "all";
    const allowedModes = new Set([
      "all",
      "projects",
      "tasks",
      "documents",
      "letters",
      "knowledge",
      "contacts",
      "organizations",
    ]);
    const mode = allowedModes.has(modeRaw)
      ? (modeRaw as
          | "all"
          | "projects"
          | "tasks"
          | "documents"
          | "letters"
          | "knowledge"
          | "contacts"
          | "organizations")
      : "all";

    return c.json({
      results: await circleService.globalSearch(auth.workspaceId, q, limit, {
        mode,
        contextKind: c.req.query("contextKind"),
        projectId: c.req.query("projectId"),
        projectSection: c.req.query("projectSection"),
        contactId: c.req.query("contactId"),
        contactSection: c.req.query("contactSection"),
        organizationId: c.req.query("organizationId"),
        organizationSection: c.req.query("organizationSection"),
      }),
    });
  });

  app.get("/api/v1/search", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("search:query")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const q = c.req.query("q");
    if (!q) {
      return c.json({ error: "Query parameter q is required", code: "bad_request" }, 400);
    }

    const type = c.req.query("type");
    const projectId = c.req.query("projectId");
    const limit = c.req.query("limit");

    const rows = await documentService.searchDocuments({
      workspaceId: auth.workspaceId,
      q,
      type: type as "project" | "knowledge" | "journal" | undefined,
      projectId,
      limit: limit ? Number(limit) : undefined,
    });

    return c.json({ results: rows.map(toSearchResult) });
  });

  app.get("/api/v1/api-keys", async (c) => {
    const auth = getAuth(c);
    if (auth.kind !== "clerk" || !auth.userId) {
      return c.json(unauthorized(), 401);
    }

    const rows = await apiKeyService.listApiKeys(auth.workspaceId);
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
        auth.workspaceId,
        auth.userId,
        c.req.valid("json"),
      );

      return c.json({ apiKey: toApiKey(row), secret }, 201);
    },
  );

  app.patch(
    "/api/v1/api-keys/:id",
    zValidator("json", updateApiKeySchema),
    async (c) => {
      const auth = getAuth(c);
      if (auth.kind !== "clerk" || !auth.userId) {
        return c.json(unauthorized(), 401);
      }

      const row = await apiKeyService.updateApiKey(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!row) {
        return c.json(notFound("API key"), 404);
      }

      return c.json(toApiKey(row));
    },
  );

  app.delete("/api/v1/api-keys/:id", async (c) => {
    const auth = getAuth(c);
    if (auth.kind !== "clerk" || !auth.userId) {
      return c.json(unauthorized(), 401);
    }

    const row = await apiKeyService.revokeApiKey(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) {
      return c.json(notFound("API key"), 404);
    }

    return c.body(null, 204);
  });
}
