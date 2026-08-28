import type { Context, Hono, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  bankAccountInputSchema,
  bankAccountCashflowQuerySchema,
  bankAccountsMonthIncomeQuerySchema,
  workspaceCashflowQuerySchema,
  financeSpendPanelQuerySchema,
  financeAssetsDebtQuerySchema,
  batchUpdateFinancialTransactionsSchema,
  batchDeleteFinancialTransactionsSchema,
  createApiKeySchema,
  createDocumentSchema,
  createHabitSchema,
  createMeetingSchema,
  updateHabitSchema,
  updateMeetingSchema,
  recordHabitDaySchema,
  createProjectSchema,
  createTaskSchema,
  createTaskCommentSchema,
  createTaskActivitySchema,
  financialCategoryInputSchema,
  financialGoalInputSchema,
  financialRecurringInputSchema,
  cashflowPlannerEntryInputSchema,
  listFinancialTransactionsQuerySchema,
  projectFsCreateEntrySchema,
  projectFsWriteFileSchema,
  reorderLetterAttachmentsSchema,
  spellcheckRequestSchema,
  updateApiKeySchema,
  updateBankAccountSchema,
  updateCursorSettingsSchema,
  updateDocumentContentSchema,
  updateDocumentSchema,
  updateFinancialCategorySchema,
  updateFinancialGoalSchema,
  updateFinancialRecurringSchema,
  updateCashflowPlannerEntrySchema,
  updateFinancialTransactionSchema,
  updateMoneybirdSettingsSchema,
  updateAgentMailSettingsSchema,
  updateEmailThreadMetadataSchema,
  createEmailThreadCommentSchema,
  updateEmailThreadCommentSchema,
  updateAgentMailDraftSchema,
  emailConceptReplyInputSchema,
  emailComposeDraftInputSchema,
  updateProjectSchema,
  updateTaskSchema,
  updateTaskCommentSchema,
  updateVaultStorageSettingsSchema,
  moneybirdSalesInvoicesQuerySchema,
  moneybirdInvoiceRevenueQuerySchema,
  researchRequestSchema,
} from "@backsteros/contracts";

import {
  toApiKey,
  toArea,
  toBankAccount,
  toDocument,
  toFinancialCategory,
  toFinancialGoal,
  toFinancialRecurring,
  toCashflowPlannerEntry,
  toFinancialImportBatch,
  toFinancialTransaction,
  toProject,
  toSearchResult,
  toTask,
  toTaskActivity,
  toTaskComment,
} from "../lib/mappers.js";
import type { AuthContext } from "../middleware/auth.js";
import { requireScope, resolveAuth } from "../middleware/auth.js";
import {
  normalizeAvatarMimeType,
  resolveAvatarContentType,
  sniffAvatarContentType,
} from "../lib/avatar-content-type.js";
import {
  MAX_AVATAR_BYTES,
  MAX_TASK_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
} from "../lib/upload-limits.js";
import * as apiKeyService from "../services/api-keys.js";
import * as documentService from "../services/documents.js";
import * as circleService from "../services/circle-domain.js";
import * as financeService from "../services/finance/finance.js";
import * as cursorSettingsService from "../services/cursor-settings.js";
import * as moneybirdSettingsService from "../services/moneybird-settings.js";
import * as agentmailSettingsService from "../services/agentmail-settings.js";
import * as emailThreadsService from "../services/email-threads.js";
import { MoneybirdApiError } from "../lib/moneybird-client.js";
import { AgentMailApiError } from "../lib/agentmail-client.js";
import { subscribeEmailUpdated } from "../lib/email-inbox-events.js";
import {
  handleAgentMailWebhookDelivery,
  svixHeadersFromRequest,
} from "../lib/agentmail-webhook.js";
import {
  AgentPtyUnavailableError,
  getAgentPtyConnection,
} from "../services/agent-pty.js";
import {
  listCursorModels,
  researchText,
  SpellcheckError,
  spellcheckText,
} from "../services/cursor-spellcheck.js";
import * as habitService from "../services/habits.js";
import * as meetingService from "../services/meetings.js";
import * as meetingSchedulingService from "../services/meeting-scheduling.js";
import * as githubService from "../services/github.js";
import * as projectFsService from "../services/project-fs.js";
import * as projectVaultService from "../services/project-vault.js";
import * as taskActivityService from "../services/task-activities.js";
import * as taskCommentService from "../services/task-comments.js";
import * as taskImageService from "../services/task-images.js";
import * as taskProjectService from "../services/tasks-projects.js";
import {
  recordAreaRestSyncEvent,
  recordBankAccountRestSyncEvent,
  recordCashflowPlannerRestSyncEvent,
  recordContactRestSyncEvent,
  recordFinancialCategoryRestSyncEvent,
  recordFinancialGoalRestSyncEvent,
  recordFinancialRecurringRestSyncEvent,
  recordHabitRestSyncEvent,
  recordLetterRestSyncEvent,
  recordMeetingRestSyncEvent,
  recordOrganizationRestSyncEvent,
  recordProjectRestSyncEvent,
  recordTaskCommentRestSyncEvent,
  recordTaskRestSyncEvent,
  recordWorkspaceSettingRestSyncEvent,
} from "../services/sync.js";
import { newId } from "../lib/crypto.js";
import { writeActorFromAuth } from "../lib/write-actor.js";
import {
  buildAreaRestPayload,
  buildContactRestPayload,
  buildLetterRestPayload,
  buildMeetingRestPayload,
  buildOrganizationRestPayload,
  buildProjectRestPayload,
  buildTaskRestPayload,
  commitRestEntityWrite,
  commitRestEntityWriteBatch,
  isRestLeaderFirstWrite,
} from "../services/rest-leader-write.js";
import { commitDocumentContentLeaderFirst } from "../services/core-replication/leader-mutations.js";
import * as vaultSettingsService from "../services/vault-settings.js";
import * as whoopService from "../services/whoop.js";

const { sanitizeWorkspaceSettings } = cursorSettingsService;

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
  moneybirdContactId: z.string().max(64).nullable().optional(),
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
  parent: z.enum(["personal", "business", "clients"]),
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
const meetingWeekdayHoursSlotSchema = z.object({
  start: z.string().min(1).max(8),
  end: z.string().min(1).max(8),
});
const meetingWeekdayHoursEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  enabled: z.boolean(),
  slots: z.array(meetingWeekdayHoursSlotSchema).min(1).max(12),
});
const updateMeetingSchedulingSettingsSchema = z.object({
  label: z.string().max(200).optional(),
  timezone: z.string().min(1).max(128).optional(),
  weekdayHours: z.array(meetingWeekdayHoursEntrySchema).min(1).max(7).optional(),
  durationsMinutes: z.array(z.union([z.literal(30), z.literal(60)])).optional(),
  minNoticeMinutes: z.number().int().nonnegative().optional(),
  bufferMinutes: z.number().int().nonnegative().optional(),
  horizonDays: z.number().int().positive().max(365).optional(),
  enabled: z.boolean().optional(),
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
    c.req.path.startsWith("/api/v1/powersync") ||
    c.req.path === "/api/v1/webhooks/agentmail"
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

    const projectId = c.req.param("id");
    // Safety: create vault folder + .cursor skills on open if missing.
    await projectVaultService.ensureProjectVaultFoldersOnly(
      auth.workspaceId,
      projectId,
    );

    const row = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!row) {
      return c.json(notFound("Project"), 404);
    }

    return c.json(toProject(row));
  });

  app.post("/api/v1/projects/:id/ensure-vault", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const projectId = c.req.param("id");
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
          return c.json(toProject(row), 201);
        }
        const row = await taskProjectService.createProject(
          auth.workspaceId,
          body,
        );
        await recordProjectRestSyncEvent(auth.workspaceId, row, "upsert");
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
        const projectId = c.req.param("id");
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
          return c.json(toProject(row!));
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
        throw error;
      }
    },
  );

  app.delete("/api/v1/projects/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const projectId = c.req.param("id");
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
    return c.body(null, 204);
  });

  app.get("/api/v1/github/status", async (c) => {
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
      const status = await githubService.getGithubConnectionStatus(token);
      return c.json(status);
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        if (
          error.code === "github_oauth_missing" ||
          error.code === "github_oauth_unavailable"
        ) {
          return c.json(githubService.disconnectedGithubStatus(error.message));
        }
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
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

  app.get("/api/v1/projects/:id/github/commits/:sha", async (c) => {
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

    const sha = c.req.param("sha")?.trim();
    if (!sha) {
      return c.json(
        { error: "Invalid commit sha", code: "bad_request" },
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
      const result = await githubService.getRepositoryCommit(
        token,
        owner,
        repo,
        sha,
      );
      return c.json({
        repository: project.githubRepository,
        commit: result.commit,
        files: result.files,
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

  app.get("/api/v1/projects/:id/github/pulls", async (c) => {
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
      const result = await githubService.listRepositoryPullRequests(
        token,
        owner,
        repo,
        { page },
      );
      return c.json({
        repository: project.githubRepository,
        page: result.page,
        hasMore: result.hasMore,
        pullRequests: result.pullRequests,
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

  app.get("/api/v1/projects/:id/github/pulls/:number", async (c) => {
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

    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
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
      const pullRequest = await githubService.getRepositoryPullRequest(
        token,
        owner,
        repo,
        number,
      );
      return c.json({
        repository: project.githubRepository,
        pullRequest,
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

  app.get("/api/v1/projects/:id/github/pulls/:number/commits", async (c) => {
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

    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
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
      const result = await githubService.listRepositoryPullRequestCommits(
        token,
        owner,
        repo,
        number,
        { page },
      );
      return c.json({
        repository: project.githubRepository,
        number,
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

  app.get("/api/v1/projects/:id/github/pulls/:number/files", async (c) => {
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

    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
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
      const result = await githubService.listRepositoryPullRequestFiles(
        token,
        owner,
        repo,
        number,
        { page },
      );
      return c.json({
        repository: project.githubRepository,
        number,
        page: result.page,
        hasMore: result.hasMore,
        files: result.files,
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

  app.get("/api/v1/projects/:id/fs/entries", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      c.req.param("id"),
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

  app.get("/api/v1/projects/:id/fs/file", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const filePath = c.req.query("path")?.trim();
    if (!filePath) {
      return c.json(
        { error: "path query is required", code: "bad_request" },
        400,
      );
    }
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      c.req.param("id"),
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
      const body = c.req.valid("json");
      const loaded = await loadCodebaseFsProject(
        auth.workspaceId,
        c.req.param("id"),
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
      const body = c.req.valid("json");
      const loaded = await loadCodebaseFsProject(
        auth.workspaceId,
        c.req.param("id"),
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
    const entryPath = c.req.query("path")?.trim();
    if (!entryPath) {
      return c.json(
        { error: "path query is required", code: "bad_request" },
        400,
      );
    }
    const loaded = await loadCodebaseFsProject(
      auth.workspaceId,
      c.req.param("id"),
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
        body.data ?? {},
        writeActorFromAuth(auth),
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
      const body = c.req.valid("json");
      const row = await taskCommentService.createTaskComment(
        auth.workspaceId,
        c.req.param("id"),
        body,
        writeActorFromAuth(auth, body.activityActor),
      );
      if (!row) return c.json(notFound("Task"), 404);
      await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
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
      await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toTaskComment(row));
    },
  );

  app.delete("/api/v1/tasks/:taskId/comments/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const commentId = c.req.param("id");
    const taskId = c.req.param("taskId");
    const existing = await taskCommentService.getTaskCommentRow(
      auth.workspaceId,
      commentId,
    );
    if (!existing || existing.taskId !== taskId) {
      return c.json(notFound("Comment"), 404);
    }
    const ok = await taskCommentService.deleteTaskComment(
      auth.workspaceId,
      taskId,
      commentId,
    );
    if (!ok) return c.json(notFound("Comment"), 404);
    const deleted = await taskCommentService.getTaskCommentRow(
      auth.workspaceId,
      commentId,
    );
    if (deleted) {
      await recordTaskCommentRestSyncEvent(auth.workspaceId, deleted, "delete");
    }
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
        const body = c.req.valid("json");
        const { activityActor, ...createInput } = body;
        if (isRestLeaderFirstWrite()) {
          const taskId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task",
            entityId: taskId,
            operation: "upsert",
            payload: buildTaskRestPayload(taskId, createInput),
          });
          const row = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!row) {
            throw new Error("TASK_CREATE_FAILED");
          }
          return c.json(toTask(row), 201);
        }
        const row = await taskProjectService.createTask(
          auth.workspaceId,
          createInput,
          undefined,
          undefined,
          writeActorFromAuth(auth, activityActor),
          { authKind: auth.kind },
        );
        await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
        return c.json(toTask(row), 201);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") {
          return c.json(
            { error: "Assignee not found", code: "assignee_not_found" },
            400,
          );
        }
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
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
        const { activityActor, agentInboxApproved, ...patch } = body;
        const taskId = c.req.param("id");
        if (isRestLeaderFirstWrite()) {
          const existing = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!existing) {
            return c.json(notFound("Task"), 404);
          }
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task",
            entityId: taskId,
            operation: "upsert",
            payload: buildTaskRestPayload(taskId, patch, {
              agentInboxApproved,
              allowAgentInboxApproval: auth.kind === "clerk",
            }),
          });
          const row = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          return c.json(toTask(row!));
        }
        const row = await taskProjectService.updateTask(
          auth.workspaceId,
          taskId,
          { ...patch, agentInboxApproved },
          undefined,
          writeActorFromAuth(auth, activityActor),
          { allowAgentInboxApproval: auth.kind === "clerk" },
        );
        if (!row) {
          return c.json(notFound("Task"), 404);
        }
        await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
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

    const taskId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getTaskById(
        auth.workspaceId,
        taskId,
      );
      if (!existing) {
        return c.json(notFound("Task"), 404);
      }
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task",
        entityId: taskId,
        operation: "delete",
        payload: { id: taskId },
      });
      return c.body(null, 204);
    }
    const row = await taskProjectService.deleteTask(
      auth.workspaceId,
      taskId,
    );
    if (!row) {
      return c.json(notFound("Task"), 404);
    }
    await recordTaskRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.post(
    "/api/v1/tasks/:id/images",
    bodyLimit({
      maxSize: MAX_TASK_IMAGE_BYTES,
      onError: (c) =>
        c.json(
          {
            error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
            code: "bad_request",
          },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const contentType =
        sniffAvatarContentType(bytes) ??
        normalizeAvatarMimeType(c.req.header("Content-Type"));
      if (
        !contentType ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_TASK_IMAGE_BYTES
      ) {
        return c.json(
          {
            error: "Image must be a JPG, PNG, WebP, or GIF up to 10 MB",
            code: "bad_request",
          },
          400,
        );
      }
      const image = await taskImageService.createTaskImage(
        auth.workspaceId,
        c.req.param("id"),
        bytes,
        contentType,
        c.req.header("X-Filename") ?? undefined,
      );
      return image
        ? c.json(image, 201)
        : c.json(notFound("Task"), 404);
    },
  );

  app.get("/api/v1/tasks/:id/images/:imageId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const result = await taskImageService.getTaskImage(
      auth.workspaceId,
      c.req.param("id"),
      c.req.param("imageId"),
    );
    if (!result) return c.json(notFound("Image"), 404);
    const contentType = resolveAvatarContentType(
      result.row.contentType,
      result.bytes,
    );
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "private, max-age=300");
    const body = Uint8Array.from(result.bytes);
    return c.body(
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    );
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
              error: "Local vault access denied — check vault folder permissions",
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
              error: "Local vault access denied — check vault folder permissions",
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
        const body = c.req.valid("json");
        const documentId = c.req.param("id");

        if (isRestLeaderFirstWrite()) {
          const result = await commitDocumentContentLeaderFirst({
            workspaceId: auth.workspaceId,
            documentId,
            content: body.content,
            ifMatchVersion: body.ifMatchVersion,
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(notFound("Document"), 404);
          }
          return c.json({
            content: body.content,
            contentType: row.contentType,
            contentVersion: result.contentVersion,
            byteSize: result.byteSize,
            checksum: row.checksum,
            updatedAt: row.updatedAt.toISOString(),
          });
        }

        const row = await documentService.updateDocumentContent(
          auth.workspaceId,
          documentId,
          body,
        );
        if (!row) {
          return c.json(notFound("Document"), 404);
        }

        return c.json({
          content: body.content,
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
        if (error instanceof Error && error.message === "EMPTY_BODY_OVER_NONEMPTY") {
          return c.json(
            {
              error: "Refusing to overwrite non-empty document with empty body",
              code: "empty_body_over_nonempty",
            },
            409,
          );
        }
        if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
          return c.json(
            {
              error: "Local vault access denied — check vault folder permissions",
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
    const rows = await (async () => {
      if (isRestLeaderFirstWrite()) {
        await commitRestEntityWriteBatch({
          workspaceId: auth.workspaceId,
          changes: ids.data.ids.map((id) => ({
            entity: "task" as const,
            entityId: id,
            operation: "upsert" as const,
            payload: buildTaskRestPayload(id, patch.data),
          })),
        });
        const loaded = await Promise.all(
          ids.data.ids.map((id) =>
            taskProjectService.getTaskById(auth.workspaceId, id),
          ),
        );
        return loaded.filter((row): row is NonNullable<typeof row> => row != null);
      }
      return taskProjectService.batchUpdateTasks(
        auth.workspaceId,
        ids.data.ids,
        patch.data,
        writeActorFromAuth(auth),
      );
    })();
    if (!isRestLeaderFirstWrite()) {
      for (const row of rows) {
        await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
      }
    }
    return c.json({ tasks: rows.map(toTask) });
  });

  app.post(
    "/api/v1/tasks/reorder",
    zValidator("json", reorderSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const orderedIds = c.req.valid("json").orderedIds;
      const rows = await (async () => {
        if (isRestLeaderFirstWrite()) {
          await commitRestEntityWriteBatch({
            workspaceId: auth.workspaceId,
            changes: orderedIds.map((id, index) => ({
              entity: "task" as const,
              entityId: id,
              operation: "upsert" as const,
              payload: buildTaskRestPayload(id, { sortOrder: index }),
            })),
          });
          const loaded = await Promise.all(
            orderedIds.map((id) =>
              taskProjectService.getTaskById(auth.workspaceId, id),
            ),
          );
          return loaded.filter((row): row is NonNullable<typeof row> => row != null);
        }
        return taskProjectService.reorderTasks(auth.workspaceId, orderedIds);
      })();
      if (!isRestLeaderFirstWrite()) {
        for (const row of rows) {
          await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
        }
      }
      return c.json({ tasks: rows.map(toTask) });
    },
  );

  app.post("/api/v1/tasks/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskId = c.req.param("id");
    const parsed = z.object({ projectId: z.string().nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid projectId", code: "bad_request" }, 400);
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      if (!existing) return c.json(notFound("Task"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task",
        entityId: taskId,
        operation: "upsert",
        payload: buildTaskRestPayload(taskId, {
          projectId: parsed.data.projectId,
          inbox: parsed.data.projectId === null,
        }),
      });
      const row = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      return c.json(toTask(row!));
    }
    const row = await taskProjectService.updateTask(
      auth.workspaceId,
      taskId,
      { projectId: parsed.data.projectId, inbox: parsed.data.projectId === null },
      undefined,
      writeActorFromAuth(auth),
    );
    if (!row) return c.json(notFound("Task"), 404);
    await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(toTask(row));
  });

  app.post("/api/v1/tasks/:id/triage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z
      .object({ projectId: z.string().nullable().optional(), status: z.string().optional() })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid triage data", code: "bad_request" }, 400);
    const taskId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      if (!existing) return c.json(notFound("Task"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task",
        entityId: taskId,
        operation: "upsert",
        payload: buildTaskRestPayload(taskId, {
          projectId: parsed.data.projectId,
          status: parsed.data.status,
          triagedAt: new Date().toISOString(),
          inbox: false,
        }),
      });
      const row = await taskProjectService.getTaskById(auth.workspaceId, taskId);
      return c.json(toTask(row!));
    }
    const row = await taskProjectService.updateTask(
      auth.workspaceId,
      taskId,
      {
        projectId: parsed.data.projectId,
        status: parsed.data.status as never,
        triagedAt: new Date().toISOString(),
        inbox: false,
      },
      undefined,
      writeActorFromAuth(auth),
    );
    if (!row) return c.json(notFound("Task"), 404);
    await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
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

  app.get("/api/v1/habits", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    return c.json({ habits: await habitService.listHabits(auth.workspaceId) });
  });

  app.get("/api/v1/habits/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const row = await habitService.getHabitById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Habit"), 404);
    return c.json(row);
  });

  app.post(
    "/api/v1/habits",
    zValidator("json", createHabitSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const row = await habitService.createHabit(
        auth.workspaceId,
        c.req.valid("json"),
      );
      const dbRow = await habitService.getHabitRow(auth.workspaceId, row.id);
      if (dbRow) {
        await recordHabitRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      return c.json(row, 201);
    },
  );

  app.patch(
    "/api/v1/habits/:id",
    zValidator("json", updateHabitSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const row = await habitService.updateHabit(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) return c.json(notFound("Habit"), 404);
        const dbRow = await habitService.getHabitRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordHabitRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        return c.json(row);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return c.json(notFound("Project"), 404);
        }
        if (error instanceof Error && error.message === "HABIT_NEXT_DUE_IN_PAST") {
          return c.json(
            {
              error: {
                code: "HABIT_NEXT_DUE_IN_PAST",
                message: "Next due date must be today or in the future.",
              },
            },
            400,
          );
        }
        if (error instanceof Error && error.message === "HABIT_DAY_EXISTS") {
          return c.json(
            {
              error: {
                code: "HABIT_DAY_EXISTS",
                message: "A habit day already exists for that date.",
              },
            },
            409,
          );
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/v1/habits/:id/days",
    zValidator("json", recordHabitDaySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const result = await habitService.recordHabitDay(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!result) return c.json(notFound("Habit"), 404);
        return c.json(toTask(result.task), result.created ? 201 : 200);
      } catch (error) {
        if (error instanceof Error && error.message === "HABIT_DAY_IN_FUTURE") {
          return c.json(
            { error: "Cannot record a future habit day", code: "bad_request" },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/meetings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    return c.json({
      meetings: await meetingService.listMeetings(auth.workspaceId),
    });
  });

  app.get("/api/v1/meetings/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const row = await meetingService.getMeetingById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Meeting"), 404);
    return c.json(row);
  });

  app.post(
    "/api/v1/meetings",
    zValidator("json", createMeetingSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const body = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const meetingId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "meeting",
            entityId: meetingId,
            operation: "upsert",
            payload: buildMeetingRestPayload(meetingId, body),
          });
          const dbRow = await meetingService.getMeetingRow(
            auth.workspaceId,
            meetingId,
          );
          if (!dbRow) {
            throw new Error("MEETING_CREATE_FAILED");
          }
          const row = await meetingService.getMeetingById(auth.workspaceId, meetingId);
          return c.json(row, 201);
        }
        const row = await meetingService.createMeeting(
          auth.workspaceId,
          body,
        );
        const dbRow = await meetingService.getMeetingRow(
          auth.workspaceId,
          row.id,
        );
        if (dbRow) {
          await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        return c.json(row, 201);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "INVALID_MEETING_DATES" ||
            error.message === "MEETING_END_BEFORE_START")
        ) {
          return c.json(
            {
              error: {
                code: "INVALID_MEETING_DATES",
                message: "Meeting end must be after start.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/meetings/:id",
    zValidator("json", updateMeetingSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const meetingId = c.req.param("id");
        const patch = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const existing = await meetingService.getMeetingRow(
            auth.workspaceId,
            meetingId,
          );
          if (!existing) return c.json(notFound("Meeting"), 404);
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "meeting",
            entityId: meetingId,
            operation: "upsert",
            payload: buildMeetingRestPayload(meetingId, patch),
          });
          const row = await meetingService.getMeetingById(auth.workspaceId, meetingId);
          return c.json(row);
        }
        const row = await meetingService.updateMeeting(
          auth.workspaceId,
          meetingId,
          patch,
        );
        if (!row) return c.json(notFound("Meeting"), 404);
        const dbRow = await meetingService.getMeetingRow(
          auth.workspaceId,
          row.id,
        );
        if (dbRow) {
          await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        return c.json(row);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "INVALID_MEETING_DATES" ||
            error.message === "MEETING_END_BEFORE_START")
        ) {
          return c.json(
            {
              error: {
                code: "INVALID_MEETING_DATES",
                message: "Meeting end must be after start.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.delete("/api/v1/meetings/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const meetingId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await meetingService.getMeetingRow(
        auth.workspaceId,
        meetingId,
      );
      if (!existing) return c.json(notFound("Meeting"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "meeting",
        entityId: meetingId,
        operation: "delete",
        payload: { id: meetingId },
      });
      return c.body(null, 204);
    }
    const dbRow = await meetingService.deleteMeetingRow(
      auth.workspaceId,
      meetingId,
    );
    if (!dbRow) return c.json(notFound("Meeting"), 404);
    await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/meeting-scheduling/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await meetingSchedulingService.getOrCreateSchedulingSettings(
        auth.workspaceId,
      ),
    );
  });

  app.patch(
    "/api/v1/meeting-scheduling/settings",
    zValidator("json", updateMeetingSchedulingSettingsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      return c.json(
        await meetingSchedulingService.updateSchedulingSettings(
          auth.workspaceId,
          c.req.valid("json"),
        ),
      );
    },
  );

  app.get("/api/v1/whoop/status", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    return c.json(whoopService.getWhoopSettingsStatus());
  });

  app.get("/api/v1/whoop/day", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    const parsed = z.string().date().safeParse(c.req.query("date"));
    if (!parsed.success) {
      return c.json({ error: "Invalid date (YYYY-MM-DD)", code: "bad_request" }, 400);
    }
    return c.json(await whoopService.fetchWhoopDaySnapshot(parsed.data));
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
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const organizationId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "upsert",
        payload: buildOrganizationRestPayload(organizationId, body),
      });
      const row = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!row) return c.json({ error: "Organization create failed", code: "internal" }, 500);
      return c.json(row, 201);
    }
    const row = await circleService.createOrganization(auth.workspaceId, body);
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row, 201);
  });
  app.patch("/api/v1/organizations/:id", zValidator("json", organizationSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const organizationId = c.req.param("id");
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!existing) return c.json(notFound("Organization"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "upsert",
        payload: buildOrganizationRestPayload(organizationId, patch),
      });
      const row = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      return c.json(row);
    }
    const row = await circleService.updateOrganization(auth.workspaceId, organizationId, patch);
    if (!row) return c.json(notFound("Organization"), 404);
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row);
  });
  app.delete("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const organizationId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!existing) return c.json(notFound("Organization"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "delete",
        payload: { id: organizationId },
      });
      return c.body(null, 204);
    }
    const row = await circleService.deleteOrganization(auth.workspaceId, organizationId);
    if (!row) return c.json(notFound("Organization"), 404);
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
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
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const contactId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "contact",
        entityId: contactId,
        operation: "upsert",
        payload: buildContactRestPayload(contactId, body),
      });
      const row = await circleService.getContactById(auth.workspaceId, contactId);
      if (!row) return c.json({ error: "Contact create failed", code: "internal" }, 500);
      return c.json(row, 201);
    }
    const row = await circleService.createContact(auth.workspaceId, body);
    await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row, 201);
  });
  app.patch("/api/v1/contacts/:id", zValidator("json", contactSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactId = c.req.param("id");
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getContactById(auth.workspaceId, contactId);
      if (!existing) return c.json(notFound("Contact"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "contact",
        entityId: contactId,
        operation: "upsert",
        payload: buildContactRestPayload(contactId, patch),
      });
      const row = await circleService.getContactById(auth.workspaceId, contactId);
      return c.json(row);
    }
    const row = await circleService.updateContact(auth.workspaceId, contactId, patch);
    if (!row) return c.json(notFound("Contact"), 404);
    await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row);
  });
  app.delete("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getContactById(auth.workspaceId, contactId);
      if (!existing) return c.json(notFound("Contact"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "contact",
        entityId: contactId,
        operation: "delete",
        payload: { id: contactId },
      });
      return c.body(null, 204);
    }
    const row = await circleService.deleteContact(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    await recordContactRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/areas", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const rows = await circleService.listAreas(auth.workspaceId);
    return c.json({ areas: rows.map(toArea) });
  });
  app.get("/api/v1/areas/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const row = await circleService.getAreaById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(toArea(row)) : c.json(notFound("Area"), 404);
  });
  app.post("/api/v1/areas", zValidator("json", areaSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const areaId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "area",
        entityId: areaId,
        operation: "upsert",
        payload: buildAreaRestPayload(areaId, body),
      });
      const row = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!row) {
        return c.json({ error: "Area create failed", code: "internal" }, 500);
      }
      return c.json(toArea(row), 201);
    }
    const row = await circleService.createArea(auth.workspaceId, body);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(toArea(row), 201);
  });
  app.patch("/api/v1/areas/:id", zValidator("json", areaSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const areaId = c.req.param("id");
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!existing) return c.json(notFound("Area"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "area",
        entityId: areaId,
        operation: "upsert",
        payload: buildAreaRestPayload(areaId, patch),
      });
      const row = await circleService.getAreaById(auth.workspaceId, areaId);
      return row ? c.json(toArea(row)) : c.json(notFound("Area"), 404);
    }
    const row = await circleService.updateArea(auth.workspaceId, areaId, patch);
    if (!row) return c.json(notFound("Area"), 404);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(toArea(row));
  });
  app.delete("/api/v1/areas/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const areaId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!existing) return c.json(notFound("Area"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "area",
        entityId: areaId,
        operation: "delete",
        payload: { id: areaId, deleted_at: new Date().toISOString() },
      });
      return c.body(null, 204);
    }
    const row = await circleService.deleteArea(auth.workspaceId, areaId);
    if (!row) return c.json(notFound("Area"), 404);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
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
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const letterId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "upsert",
        payload: buildLetterRestPayload(letterId, body),
      });
      const row = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!row) return c.json({ error: "Letter create failed", code: "internal" }, 500);
      return c.json(row, 201);
    }
    const row = await circleService.createLetter(auth.workspaceId, body);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row, 201);
  });
  app.patch("/api/v1/letters/:id", zValidator("json", letterSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const letterId = c.req.param("id");
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!existing) return c.json(notFound("Letter"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "upsert",
        payload: buildLetterRestPayload(letterId, patch),
      });
      const row = await circleService.getLetterById(auth.workspaceId, letterId);
      return c.json(row);
    }
    const row = await circleService.updateLetter(auth.workspaceId, letterId, patch);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row);
  });
  app.delete("/api/v1/letters/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const letterId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!existing) return c.json(notFound("Letter"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "delete",
        payload: { id: letterId },
      });
      return c.body(null, 204);
    }
    const row = await circleService.deleteLetter(auth.workspaceId, letterId);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
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
    const letterId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getLetterById(auth.workspaceId, letterId);
      if (!existing) return c.json(notFound("Letter"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "letter",
        entityId: letterId,
        operation: "upsert",
        payload: buildLetterRestPayload(letterId, parsed.data),
      });
      const row = await circleService.getLetterById(auth.workspaceId, letterId);
      return c.json(row);
    }
    const row = await circleService.triageLetter(auth.workspaceId, letterId, parsed.data);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    return c.json(row);
  });
  app.put("/api/v1/letters/:id/pdf", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
      return c.json(
        {
          error: "Letter PDFs can only be stored on local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
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
    if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
      return c.json(
        {
          error: "Letter PDFs are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
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
    if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
      return c.json(
        {
          error: "Letter PDFs can only be stored on local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
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
    if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
      return c.json(
        {
          error: "Letter PDFs are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
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
            error: "Avatar must be a JPG, PNG, WebP, GIF, or SVG up to 5 MB",
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
    const settings = sanitizeWorkspaceSettings(
      (await circleService.getSettings(auth.workspaceId)) as Record<
        string,
        unknown
      >,
    );
    return c.json({ settings });
  });
  app.get("/api/v1/settings/storage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    await vaultSettingsService.warmVaultPathCache(auth.workspaceId);
    return c.json(
      await vaultSettingsService.getVaultStorageSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/storage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateVaultStorageSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid vault settings", code: "bad_request" }, 400);
    }
    try {
      return c.json(
        await vaultSettingsService.updateVaultStorageSettings(
          auth.workspaceId,
          parsed.data.vaultPath,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not set vault path";
      if (message === "VAULT_PATH_REQUIRED") {
        return c.json({ error: "Vault path is required", code: "bad_request" }, 400);
      }
      if (message === "VAULT_PATH_CLOUD_FORBIDDEN") {
        return c.json(
          {
            error: "vaultPath is machine-local and cannot be set on cloud-core",
            code: "vault_path_cloud_forbidden",
          },
          400,
        );
      }
      return c.json(
        {
          error: `Vault path is not usable: ${message}`,
          code: "bad_request",
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/cursor", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(await cursorSettingsService.getCursorSettings(auth.workspaceId));
  });
  app.patch("/api/v1/settings/cursor", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateCursorSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid Cursor settings", code: "bad_request" }, 400);
    }
    return c.json(
      await cursorSettingsService.updateCursorSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/cursor/models", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const models = await listCursorModels(auth.workspaceId);
      return c.json({ models });
    } catch (error) {
      if (error instanceof SpellcheckError && error.code === "missing_key") {
        return c.json({ error: error.message, code: "bad_request" }, 400);
      }
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not list Cursor models",
          code: "bad_request",
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/moneybird", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await moneybirdSettingsService.getMoneybirdSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/moneybird", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateMoneybirdSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid Moneybird settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await moneybirdSettingsService.updateMoneybirdSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/moneybird/administrations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const administrations =
        await moneybirdSettingsService.listMoneybirdAdministrations(
          auth.workspaceId,
        );
      return c.json({ administrations });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list Moneybird administrations";
      const status =
        error instanceof MoneybirdApiError && error.status === 401 ? 400 : 400;
      return c.json({ error: message, code: "bad_request" }, status);
    }
  });
  app.get("/api/v1/settings/moneybird/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await moneybirdSettingsService.testMoneybirdConnection(auth.workspaceId),
    );
  });
  app.get("/api/v1/settings/agentmail", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      return c.json(
        await agentmailSettingsService.getAgentMailSettings(auth.workspaceId),
      );
    } catch (error) {
      console.error("AgentMail settings read failed:", error);
      return c.json(
        {
          error: agentmailSettingsService.formatAgentMailSettingsError(error),
          code: "bad_request" as const,
        },
        400,
      );
    }
  });
  app.patch("/api/v1/settings/agentmail", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateAgentMailSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid AgentMail settings", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await agentmailSettingsService.updateAgentMailSettings(
          auth.workspaceId,
          parsed.data,
        ),
      );
    } catch (error) {
      console.error("AgentMail settings update failed:", error);
      return c.json(
        {
          error: agentmailSettingsService.formatAgentMailSettingsError(error),
          code: "bad_request" as const,
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/agentmail/inboxes", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const inboxes = await agentmailSettingsService.listAgentMailInboxes(
        auth.workspaceId,
      );
      return c.json({ inboxes });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list AgentMail inboxes";
      const status =
        error instanceof AgentMailApiError && error.status === 401 ? 400 : 400;
      return c.json({ error: message, code: "bad_request" }, status);
    }
  });
  app.get("/api/v1/settings/agentmail/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await agentmailSettingsService.testAgentMailConnection(auth.workspaceId),
    );
  });
  app.get("/api/v1/email/messages", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const messages = await agentmailSettingsService.listAgentMailMessages(
        auth.workspaceId,
      );
      return c.json({ messages });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list AgentMail messages";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });

  app.get("/api/v1/email/events", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsubscribe = subscribeEmailUpdated(workspaceId, (event) => {
        if (closed) return;
        void stream.writeSSE({
          event: "email.updated",
          data: JSON.stringify({
            inboxId: event.inboxId,
            messageId: event.messageId,
          }),
        });
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      await stream.writeSSE({
        event: "ready",
        data: JSON.stringify({ ok: true }),
      });
      while (!closed) {
        await stream.sleep(15_000);
        if (closed) break;
        try {
          await stream.writeSSE({ event: "ping", data: "{}" });
        } catch {
          closed = true;
          break;
        }
      }
      unsubscribe();
    });
  });

  app.post("/api/v1/webhooks/agentmail", async (c) => {
    const rawBody = await c.req.text();
    const headers = svixHeadersFromRequest((name) => c.req.header(name));
    const secrets = await agentmailSettingsService.listAgentMailWebhookSecrets();
    const result = handleAgentMailWebhookDelivery({
      rawBody,
      headers,
      secrets,
      deliveryId: headers["svix-id"] ?? null,
    });
    if (!result.ok) {
      return c.body(null, 400);
    }
    return c.body(null, 204);
  });

  app.get(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.getAgentMailMessage(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load AgentMail message";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.get(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/attachments/:attachmentId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      const attachmentId = decodeURIComponent(c.req.param("attachmentId"));
      try {
        const result = await agentmailSettingsService.getAgentMailMessageAttachment(
          auth.workspaceId,
          inboxId,
          messageId,
          attachmentId,
        );
        c.header("Content-Type", result.contentType);
        if (result.filename) {
          c.header(
            "Content-Disposition",
            `inline; filename="${result.filename.replaceAll('"', "")}"`,
          );
        }
        return c.body(Uint8Array.from(result.bytes).buffer);
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load AgentMail attachment";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.delete(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      const scope = c.req.query("scope");
      try {
        if (scope === "message") {
          return c.json(
            await agentmailSettingsService.deleteAgentMailThreadMessage(
              auth.workspaceId,
              inboxId,
              messageId,
            ),
          );
        }
        return c.json(
          await agentmailSettingsService.deleteAgentMailMessage(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not delete AgentMail conversation";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/report-spam",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.reportAgentMailMessageSpam(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not report AgentMail message as spam";
        const status =
          error instanceof AgentMailApiError && error.status === 404
            ? 404
            : 400;
        return c.json(
          { error: message, code: status === 404 ? "not_found" : "bad_request" },
          status,
        );
      }
    },
  );
  app.get(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/source",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.getAgentMailMessageSource(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load AgentMail message source";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/mark-unread",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      try {
        return c.json(
          await agentmailSettingsService.markAgentMailMessageUnread(
            auth.workspaceId,
            inboxId,
            messageId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not mark AgentMail message unread";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/email/inboxes/:inboxId/drafts/:draftId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const inboxId = decodeURIComponent(c.req.param("inboxId"));
    const draftId = decodeURIComponent(c.req.param("draftId"));
    try {
      return c.json(
        await agentmailSettingsService.getAgentMailDraft(
          auth.workspaceId,
          inboxId,
          draftId,
        ),
      );
    } catch (error) {
      if (error instanceof AgentMailApiError && error.status === 404) {
        return c.json({ error: error.message, code: "not_found" }, 404);
      }
      const message =
        error instanceof Error ? error.message : "Could not load AgentMail draft";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.post(
    "/api/v1/email/inboxes/:inboxId/messages/:messageId/concept-reply",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const messageId = decodeURIComponent(c.req.param("messageId"));
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = emailConceptReplyInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: parsed.error.message, code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await agentmailSettingsService.upsertEmailConceptReply(
            auth.workspaceId,
            inboxId,
            messageId,
            parsed.data.body,
          ),
        );
      } catch (error) {
        console.error("[email] concept-reply failed:", {
          inboxId,
          messageId,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  status: (error as { status?: number }).status,
                }
              : error,
        });
        if (error instanceof AgentMailApiError) {
          return c.json(
            {
              error: error.message,
              code: error.status === 404 ? "not_found" : "bad_request",
            },
            error.status === 404 ? 404 : 400,
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not save reply concept";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/compose-draft",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body", code: "bad_request" }, 400);
      }
      const parsed = emailComposeDraftInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: parsed.error.message, code: "bad_request" },
          400,
        );
      }
      try {
        return c.json(
          await agentmailSettingsService.upsertEmailComposeDraft(
            auth.workspaceId,
            inboxId,
            parsed.data,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError) {
          return c.json(
            {
              error: error.message,
              code: error.status === 404 ? "not_found" : "bad_request",
            },
            error.status === 404 ? 404 : 400,
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not save compose draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/drafts/:draftId/send",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const draftId = decodeURIComponent(c.req.param("draftId"));
      try {
        return c.json(
          await agentmailSettingsService.sendAgentMailDraft(
            auth.workspaceId,
            inboxId,
            draftId,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError) {
          return c.json(
            {
              error: error.message,
              code: error.status === 404 ? "not_found" : "bad_request",
            },
            error.status === 404 ? 404 : 400,
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not send draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.delete("/api/v1/email/inboxes/:inboxId/drafts/:draftId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const inboxId = decodeURIComponent(c.req.param("inboxId"));
    const draftId = decodeURIComponent(c.req.param("draftId"));
    try {
      return c.json(
        await agentmailSettingsService.deleteAgentMailDraft(
          auth.workspaceId,
          inboxId,
          draftId,
        ),
      );
    } catch (error) {
      if (error instanceof AgentMailApiError) {
        return c.json(
          {
            error: error.message,
            code: error.status === 404 ? "not_found" : "bad_request",
          },
          error.status === 404 ? 404 : 400,
        );
      }
      const message =
        error instanceof Error ? error.message : "Could not delete draft";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.patch(
    "/api/v1/email/inboxes/:inboxId/drafts/:draftId",
    zValidator("json", updateAgentMailDraftSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const draftId = decodeURIComponent(c.req.param("draftId"));
      try {
        return c.json(
          await agentmailSettingsService.updateAgentMailDraft(
            auth.workspaceId,
            inboxId,
            draftId,
            c.req.valid("json").body,
          ),
        );
      } catch (error) {
        if (error instanceof AgentMailApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error ? error.message : "Could not update draft";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/email/threads/by-display-id/:displayId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read") && !can(auth, "settings:write")) {
      return c.json(forbidden(), 403);
    }
    const displayId = decodeURIComponent(c.req.param("displayId"));
    const metadata = await emailThreadsService.getEmailThreadByDisplayId(
      auth.workspaceId,
      displayId,
    );
    if (!metadata) {
      return c.json({ error: "Email thread not found", code: "not_found" }, 404);
    }
    return c.json(metadata);
  });
  app.patch(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/metadata",
    zValidator("json", updateEmailThreadMetadataSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      try {
        const row = await emailThreadsService.updateEmailThreadMetadata(
          auth.workspaceId,
          inboxId,
          threadKey,
          c.req.valid("json"),
        );
        if (!row) {
          return c.json({ error: "Thread not found", code: "not_found" }, 404);
        }
        return c.json(row);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not update email thread metadata";
        const code =
          message.endsWith("_NOT_FOUND") ? "not_found" : "bad_request";
        return c.json({ error: message, code }, code === "not_found" ? 404 : 400);
      }
    },
  );
  app.get(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read") && !can(auth, "settings:write")) {
        return c.json(forbidden(), 403);
      }
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const comments = await emailThreadsService.listEmailThreadComments(
        auth.workspaceId,
        inboxId,
        threadKey,
      );
      return c.json({ comments });
    },
  );
  app.post(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments",
    zValidator("json", createEmailThreadCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const inboxId = decodeURIComponent(c.req.param("inboxId"));
      const threadKey = decodeURIComponent(c.req.param("threadKey"));
      const input = c.req.valid("json");
      const comment = await emailThreadsService.createEmailThreadComment(
        auth.workspaceId,
        inboxId,
        threadKey,
        { body: input.body, author: input.author },
      );
      return c.json(comment, 201);
    },
  );
  app.patch(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments/:commentId",
    zValidator("json", updateEmailThreadCommentSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const commentId = decodeURIComponent(c.req.param("commentId"));
      const comment = await emailThreadsService.updateEmailThreadComment(
        auth.workspaceId,
        commentId,
        c.req.valid("json").body,
      );
      if (!comment) {
        return c.json({ error: "Comment not found", code: "not_found" }, 404);
      }
      return c.json(comment);
    },
  );
  app.delete(
    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments/:commentId",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const commentId = decodeURIComponent(c.req.param("commentId"));
      const deleted = await emailThreadsService.deleteEmailThreadComment(
        auth.workspaceId,
        commentId,
      );
      if (!deleted) {
        return c.json({ error: "Comment not found", code: "not_found" }, 404);
      }
      return c.json({ ok: true });
    },
  );
  app.get(
    "/api/v1/finance/moneybird/invoices",
    zValidator("query", moneybirdSalesInvoicesQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const page = query.page ?? 1;
      const perPage = query.perPage ?? 50;
      try {
        const result =
          await moneybirdSettingsService.listMoneybirdSalesInvoicesPage(
            auth.workspaceId,
            {
              page,
              perPage,
              filter: query.filter,
            },
          );
        return c.json({
          invoices: result.invoices,
          page: result.page,
          perPage: result.perPage,
          hasMore: result.hasMore,
          totalPages: result.totalPages,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not list Moneybird invoices";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/finance/moneybird/invoices/:invoiceId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const invoiceId = c.req.param("invoiceId")?.trim() ?? "";
    if (!invoiceId) {
      return c.json({ error: "Invoice id is required", code: "bad_request" }, 400);
    }
    try {
      return c.json(
        await moneybirdSettingsService.getMoneybirdSalesInvoiceDetail(
          auth.workspaceId,
          invoiceId,
        ),
      );
    } catch (error) {
      if (error instanceof MoneybirdApiError && error.status === 404) {
        return c.json({ error: "Invoice not found", code: "not_found" }, 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Could not load Moneybird invoice";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.get(
    "/api/v1/finance/moneybird/invoice-revenue",
    zValidator("query", moneybirdInvoiceRevenueQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const year = c.req.valid("query").year ?? new Date().getFullYear();
      try {
        const revenue =
          await moneybirdSettingsService.getMoneybirdInvoiceRevenue(
            auth.workspaceId,
            year,
          );
        return c.json(revenue);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load Moneybird invoice revenue";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/agent-pty/connection", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    try {
      return c.json(getAgentPtyConnection());
    } catch (error) {
      if (error instanceof AgentPtyUnavailableError) {
        return c.json(
          { error: error.message, code: error.code },
          503,
        );
      }
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Agent terminal unavailable",
          code: "agent_pty_unavailable",
        },
        503,
      );
    }
  });
  app.post("/api/v1/ai/spellcheck", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = spellcheckRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid spellcheck request", code: "bad_request" }, 400);
    }
    try {
      return c.json(await spellcheckText(auth.workspaceId, parsed.data));
    } catch (error) {
      if (error instanceof SpellcheckError) {
        const status =
          error.code === "disabled" || error.code === "missing_key" ? 400 : 502;
        return c.json(
          {
            error: error.message,
            code: error.code === "upstream" ? "upstream_error" : "bad_request",
          },
          status,
        );
      }
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Spellcheck failed",
          code: "upstream_error",
        },
        502,
      );
    }
  });
  app.post("/api/v1/ai/research", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = researchRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid research request", code: "bad_request" }, 400);
    }
    try {
      return c.json(await researchText(auth.workspaceId, parsed.data));
    } catch (error) {
      if (error instanceof SpellcheckError) {
        const status =
          error.code === "disabled" || error.code === "missing_key" ? 400 : 502;
        return c.json(
          {
            error: error.message,
            code: error.code === "upstream" ? "upstream_error" : "bad_request",
          },
          status,
        );
      }
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Research failed",
          code: "upstream_error",
        },
        502,
      );
    }
  });
  app.patch("/api/v1/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = z.record(z.unknown()).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid settings", code: "bad_request" }, 400);
    const sanitized = sanitizeWorkspaceSettings(parsed.data);
    if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
      delete sanitized.vaultPath;
    }
    const settings = sanitizeWorkspaceSettings(
      (await circleService.updateSettings(
        auth.workspaceId,
        sanitized,
      )) as Record<string, unknown>,
    );
    await recordWorkspaceSettingRestSyncEvent(auth.workspaceId, settings);
    return c.json({ settings });
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

  app.get("/api/v1/bank-accounts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listBankAccounts(auth.workspaceId);
    return c.json({ bankAccounts: rows.map(toBankAccount) });
  });
  app.get("/api/v1/bank-accounts/balances", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const balances = await financeService.listBankAccountBalances(
      auth.workspaceId,
    );
    return c.json({ balances });
  });
  app.get(
    "/api/v1/finance/assets-debt",
    zValidator("query", financeAssetsDebtQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const range = c.req.valid("query").range ?? "1M";
      const series = await financeService.getFinanceAssetsDebt(
        auth.workspaceId,
        range,
      );
      return c.json(series);
    },
  );
  app.get(
    "/api/v1/bank-accounts/month-income",
    zValidator("query", bankAccountsMonthIncomeQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const month =
        c.req.valid("query").month ??
        (() => {
          const now = new Date();
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        })();
      const result = await financeService.getBankAccountsMonthIncome(
        auth.workspaceId,
        month,
      );
      return c.json(result);
    },
  );
  app.get(
    "/api/v1/bank-accounts/:id/cashflow",
    zValidator("query", bankAccountCashflowQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const year =
        c.req.valid("query").year ?? new Date().getFullYear();
      const cashflow = await financeService.getBankAccountCashflow(
        auth.workspaceId,
        c.req.param("id"),
        year,
      );
      return cashflow
        ? c.json(cashflow)
        : c.json(notFound("Bank account"), 404);
    },
  );
  app.get(
    "/api/v1/finance/cashflow",
    zValidator("query", workspaceCashflowQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const year = query.year ?? new Date().getFullYear();
      const cashflow = await financeService.getWorkspaceCashflow(
        auth.workspaceId,
        year,
        query.asOf,
      );
      return c.json(cashflow);
    },
  );
  app.get(
    "/api/v1/finance/spend-panel",
    zValidator("query", financeSpendPanelQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const panel = await financeService.getFinanceSpendPanel(
        auth.workspaceId,
        query.month,
        query.historyMonths,
      );
      return c.json(panel);
    },
  );
  app.get("/api/v1/bank-accounts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const row = await financeService.getBankAccountById(
      auth.workspaceId,
      c.req.param("id"),
    );
    return row ? c.json(toBankAccount(row)) : c.json(notFound("Bank account"), 404);
  });
  app.post(
    "/api/v1/bank-accounts",
    zValidator("json", bankAccountInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.createBankAccount(
        auth.workspaceId,
        c.req.valid("json"),
      );
      await recordBankAccountRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toBankAccount(row), 201);
    },
  );
  app.patch(
    "/api/v1/bank-accounts/:id",
    zValidator("json", updateBankAccountSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.updateBankAccount(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!row) return c.json(notFound("Bank account"), 404);
      await recordBankAccountRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toBankAccount(row));
    },
  );
  app.delete("/api/v1/bank-accounts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const row = await financeService.deleteBankAccount(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Bank account"), 404);
    await recordBankAccountRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/financial-categories", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listFinancialCategories(auth.workspaceId);
    return c.json({ categories: rows.map(toFinancialCategory) });
  });
  app.post(
    "/api/v1/financial-categories",
    zValidator("json", financialCategoryInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.createFinancialCategory(
        auth.workspaceId,
        c.req.valid("json"),
      );
      await recordFinancialCategoryRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialCategory(row), 201);
    },
  );
  app.patch(
    "/api/v1/financial-categories/:id",
    zValidator("json", updateFinancialCategorySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.updateFinancialCategory(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!row) return c.json(notFound("Financial category"), 404);
      await recordFinancialCategoryRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialCategory(row));
    },
  );
  app.delete("/api/v1/financial-categories/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const row = await financeService.deleteFinancialCategory(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Financial category"), 404);
    await recordFinancialCategoryRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/financial-goals", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const [rows, savedByGoalId] = await Promise.all([
      financeService.listFinancialGoals(auth.workspaceId),
      financeService.sumSavedCentsByGoalId(auth.workspaceId),
    ]);
    return c.json({
      goals: rows.map((row) =>
        toFinancialGoal(row, savedByGoalId.get(row.id) ?? 0),
      ),
    });
  });
  app.post(
    "/api/v1/financial-goals",
    zValidator("json", financialGoalInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.createFinancialGoal(
        auth.workspaceId,
        c.req.valid("json"),
      );
      await recordFinancialGoalRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialGoal(row, 0), 201);
    },
  );
  app.patch(
    "/api/v1/financial-goals/:id",
    zValidator("json", updateFinancialGoalSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const id = c.req.param("id");
      const row = await financeService.updateFinancialGoal(
        auth.workspaceId,
        id,
        c.req.valid("json"),
      );
      if (!row) return c.json(notFound("Financial goal"), 404);
      await recordFinancialGoalRestSyncEvent(auth.workspaceId, row, "upsert");
      const savedCents = await financeService.getGoalSavedCents(
        auth.workspaceId,
        id,
      );
      return c.json(toFinancialGoal(row, savedCents));
    },
  );
  app.delete("/api/v1/financial-goals/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const row = await financeService.deleteFinancialGoal(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Financial goal"), 404);
    await recordFinancialGoalRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/financial-recurrings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listFinancialRecurrings(auth.workspaceId);
    return c.json({ recurrings: rows.map(toFinancialRecurring) });
  });
  app.post(
    "/api/v1/financial-recurrings",
    zValidator("json", financialRecurringInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.createFinancialRecurring(
        auth.workspaceId,
        c.req.valid("json"),
      );
      await recordFinancialRecurringRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialRecurring(row), 201);
    },
  );
  app.patch(
    "/api/v1/financial-recurrings/:id",
    zValidator("json", updateFinancialRecurringSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.updateFinancialRecurring(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!row) return c.json(notFound("Financial recurring"), 404);
      await recordFinancialRecurringRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialRecurring(row));
    },
  );
  app.delete("/api/v1/financial-recurrings/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const row = await financeService.deleteFinancialRecurring(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Financial recurring"), 404);
    await recordFinancialRecurringRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/cashflow-planner-entries", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listCashflowPlannerEntries(
      auth.workspaceId,
    );
    return c.json({ entries: rows.map(toCashflowPlannerEntry) });
  });
  app.post(
    "/api/v1/cashflow-planner-entries",
    zValidator("json", cashflowPlannerEntryInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.createCashflowPlannerEntry(
        auth.workspaceId,
        c.req.valid("json"),
      );
      await recordCashflowPlannerRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toCashflowPlannerEntry(row), 201);
    },
  );
  app.patch(
    "/api/v1/cashflow-planner-entries/:id",
    zValidator("json", updateCashflowPlannerEntrySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.updateCashflowPlannerEntry(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!row) return c.json(notFound("Cashflow planner entry"), 404);
      await recordCashflowPlannerRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toCashflowPlannerEntry(row));
    },
  );
  app.delete("/api/v1/cashflow-planner-entries/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const row = await financeService.deleteCashflowPlannerEntry(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Cashflow planner entry"), 404);
    await recordCashflowPlannerRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  const toListTransactionFilters = (
    query: z.infer<typeof listFinancialTransactionsQuerySchema>,
  ) => ({
    q: query.q,
    from: query.from,
    to: query.to,
    month: query.month,
    organizationId: query.organizationId,
    projectId: query.projectId,
    categoryId: query.categoryId,
    goalId: query.goalId,
    recurringId: query.recurringId,
    categoryIds: query.categoryIds
      ? query.categoryIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined,
    uncategorized: query.uncategorized === "true",
    unassignedOrg: query.unassignedOrg === "true",
    unassignedGoal: query.unassignedGoal === "true",
    unassignedRecurring: query.unassignedRecurring === "true",
    amountSign: query.amountSign,
    limit: query.limit,
    cursor: query.cursor,
    includeTotal: query.includeTotal === "true",
  });

  app.get(
    "/api/v1/transactions",
    zValidator("query", listFinancialTransactionsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const result = await financeService.listTransactions(
        auth.workspaceId,
        null,
        toListTransactionFilters(query),
      );
      if (!result) return c.json(forbidden(), 403);
      return c.json({
        transactions: result.transactions.map(toFinancialTransaction),
        nextCursor: result.nextCursor,
        ...(result.total !== undefined ? { total: result.total } : {}),
      });
    },
  );

  app.get(
    "/api/v1/bank-accounts/:id/transactions",
    zValidator("query", listFinancialTransactionsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const result = await financeService.listTransactions(
        auth.workspaceId,
        c.req.param("id"),
        toListTransactionFilters(query),
      );
      if (!result) return c.json(notFound("Bank account"), 404);
      return c.json({
        transactions: result.transactions.map(toFinancialTransaction),
        nextCursor: result.nextCursor,
        ...(result.total !== undefined ? { total: result.total } : {}),
      });
    },
  );

  app.get(
    "/api/v1/transactions/:id",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const row = await financeService.getTransactionById(
        auth.workspaceId,
        c.req.param("id"),
      );
      return row
        ? c.json(toFinancialTransaction(row))
        : c.json(notFound("Transaction"), 404);
    },
  );

  app.patch(
    "/api/v1/transactions/:id",
    zValidator("json", updateFinancialTransactionSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const row = await financeService.updateTransaction(
        auth.workspaceId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (row === "account_not_found") {
        return c.json(notFound("Bank account"), 404);
      }
      return row
        ? c.json(toFinancialTransaction(row))
        : c.json(notFound("Transaction"), 404);
    },
  );

  app.post(
    "/api/v1/transactions/batch",
    zValidator("json", batchUpdateFinancialTransactionsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      const rows = await financeService.batchUpdateTransactions(
        auth.workspaceId,
        body.ids,
        body.patch,
      );
      if (rows === "account_not_found") {
        return c.json(notFound("Bank account"), 404);
      }
      return c.json({
        updated: rows.length,
        transactions: rows.map(toFinancialTransaction),
      });
    },
  );

  app.post(
    "/api/v1/transactions/batch-delete",
    zValidator("json", batchDeleteFinancialTransactionsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      const deleted = await financeService.batchDeleteTransactions(
        auth.workspaceId,
        body.ids,
      );
      return c.json({ deleted });
    },
  );

  app.get("/api/v1/bank-accounts/:id/imports", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listImportBatches(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!rows) return c.json(notFound("Bank account"), 404);
    return c.json({ imports: rows.map(toFinancialImportBatch) });
  });

  app.post(
    "/api/v1/bank-accounts/:id/imports",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) =>
        c.json(
          { error: "CSV too large", code: "payload_too_large" },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength === 0) {
        return c.json({ error: "Empty CSV body", code: "bad_request" }, 400);
      }
      try {
        const result = await financeService.importBankCsv(
          auth.workspaceId,
          c.req.param("id"),
          bytes,
          c.req.header("X-Filename") ?? "import.csv",
        );
        if (!result) return c.json(notFound("Bank account"), 404);
        return c.json(result, 201);
      } catch (error) {
        return c.json(
          {
            error: error instanceof Error ? error.message : "Import failed",
            code: "bad_request",
          },
          400,
        );
      }
    },
  );

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

      try {
        const { row, secret } = await apiKeyService.createApiKey(
          auth.workspaceId,
          auth.userId,
          c.req.valid("json"),
        );
        return c.json({ apiKey: toApiKey(row), secret }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        throw error;
      }
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

      try {
        const row = await apiKeyService.updateApiKey(
          auth.workspaceId,
          c.req.param("id"),
          c.req.valid("json"),
        );
        if (!row) {
          return c.json(notFound("API key"), 404);
        }
        return c.json(toApiKey(row));
      } catch (error) {
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        throw error;
      }
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
