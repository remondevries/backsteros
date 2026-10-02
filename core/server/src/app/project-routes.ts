/**
 * project-routes routes (OS-73 split from routes.ts).
 */
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
  listActivitiesQuerySchema,
  updateTaskTimerSessionActorSchema,
  financialCategoryInputSchema,
  financialGoalInputSchema,
  financialRecurringInputSchema,
  cashflowPlannerEntryInputSchema,
  listFinancialTransactionsQuerySchema,
  listTaskAgentPresenceQuerySchema,
  projectFsCreateEntrySchema,
  projectFsWriteFileSchema,
  reorderLetterAttachmentsSchema,
  reorderTaskAttachmentsSchema,
  spellcheckRequestSchema,
  updateApiKeySchema,
  updateBankAccountSchema,
  updateCursorSettingsSchema,
  updateDocumentContentSchema,
  updateDocumentSectionSchema,
  documentRetrievalQuerySchema,
  listDocumentsQuerySchema,
  putDocumentPropertiesSchema,
  updateDocumentSchema,
  updateFinancialCategorySchema,
  updateFinancialGoalSchema,
  updateFinancialRecurringSchema,
  updateCashflowPlannerEntrySchema,
  updateFinancialTransactionSchema,
  updateMoneybirdSettingsSchema,
  updateMapboxSettingsSchema,
  mapboxGeocodeQuerySchema,
  mapboxStaticMapQuerySchema,
  updateGithubSettingsSchema,
  updateTransipSettingsSchema,
  updateCloudflareSettingsSchema,
  updateCloudflareDnsRecordSchema,
  updateTransipDomainContactsInputSchema,
  updateTransipDomainNameserversInputSchema,
  updateAgentMailSettingsSchema,
  updateEmailThreadMetadataSchema,
  createEmailThreadCommentSchema,
  updateEmailThreadCommentSchema,
  updateAgentMailDraftSchema,
  emailConceptReplyInputSchema,
  emailAgentDraftInputSchema,
  emailComposeDraftInputSchema,
  updateProjectSchema,
  updateTaskSchema,
  updateTaskCommentSchema,
  updateVaultStorageSettingsSchema,
  upsertDevicePushTokenSchema,
  upsertTaskAgentPresenceSchema,
  deleteDevicePushTokenSchema,
  moneybirdSalesInvoicesQuerySchema,
  moneybirdInvoiceRevenueQuerySchema,
  moneybirdBankAccountSyncQuerySchema,
  researchRequestSchema,
  contactRelationshipInputSchema,
  updateContactRelationshipSchema,
  crmRelationshipLabelInputSchema,
  updateCrmRelationshipLabelSchema,
  crmGroupInputSchema,
  updateCrmGroupSchema,
  crmGroupMemberInputSchema,
  createCrmActivityNoteSchema,
  crmActivityFeedQuerySchema,
  portalAuthLoginSchema,
  createPortalContactLogSchema,
  createProjectUpdateSchema,
  updateProjectUpdateSchema,
  avatarSignedUrlQuerySchema,
  publicAvatarQuerySchema,
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
import { toPublicContact } from "../lib/public-contact.js";
import { PortalUsernameConflictError } from "../lib/portal-contact-auth.js";
import { hashPortalPassword, verifyPortalPassword } from "../lib/portal-password.js";
import { proxyErrorStatus } from "../lib/proxy-http-status.js";
import type { AuthContext } from "../middleware/auth.js";
import {
  requireScope,
  resolveAuth,
  isOwnerShellAuth,
  logUnauthorizedRequest,
} from "../middleware/auth.js";

import { canManageApiKeys } from "../lib/powersync-auth.js";
import {
  can,
  unauthorized,
  forbidden,
  getAuth,
  notFound,
  listQueryErrorBody,
  nudgePeerEntityLive,
} from "./route-helpers.js";
import {
  normalizeAvatarMimeType,
  resolveAvatarContentType,
  sniffAvatarContentType,
} from "../lib/avatar-content-type.js";
import {
  buildAvatarSignedUrl,
  getAvatarUrlSigningSecret,
  getPublicApiOrigin,
  isAvatarSignedEntityType,
  verifyAvatarSignature,
} from "../lib/avatar-signed-url.js";
import { resolveTaskAttachmentContentType } from "../lib/task-attachment-content-type.js";
import {
  MAX_AVATAR_BYTES,
  MAX_TASK_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
} from "../lib/upload-limits.js";
import * as apiKeyService from "../services/api-keys.js";
import * as documentService from "../services/documents.js";
import {
  DocumentPropertyError,
  getDocumentProperties,
  putDocumentProperties,
} from "../services/document-properties.js";
import {
  parseDocumentListTypeFilter,
  parseExactMultiQueryValues,
  parseMultiQueryValues,
  resolveSectionIfMatchVersion,
} from "../lib/document-property-filters.js";
import {
  TASK_LIST_DEFAULT_EXCLUSION_HINT,
  TaskFilterError,
  ignoredLegacyTaskListKeys,
  parseTaskListQuery,
  taskListUsesDefaultStatusExclusion,
} from "../lib/task-filters.js";
import {
  DOCUMENTS_DEFAULT_LIMIT,
  ListQueryError,
  assertDocumentListTypeValue,
  collectQueryParams,
  ignoredLegacyListKeys,
  CONTACTS_LIST_PAGINATED_ONLY_KEYS,
  EMAIL_MESSAGES_LIST_PAGINATED_ONLY_KEYS,
  LETTERS_LIST_PAGINATED_ONLY_KEYS,
  MEETINGS_LIST_PAGINATED_ONLY_KEYS,
  ORGANIZATIONS_LIST_PAGINATED_ONLY_KEYS,
  PROJECTS_LIST_PAGINATED_ONLY_KEYS,
  DUE_TASKS_LIST_PAGINATED_ONLY_KEYS,
  parseContactsListQuery,
  parseDocumentsListLimit,
  parseDueTasksListQuery,
  parseEmailMessagesListQuery,
  parseGlobalSearchQuery,
  parseLettersListQuery,
  parseMeetingsListQuery,
  parseOrganizationsListQuery,
  parseProjectsListQuery,
  parseSearchQuery,
  paginateByUpdatedAtId,
} from "../lib/list-query.js";
import {
  resolveContactRef,
  resolveOrganizationRef,
  resolveProjectRef,
  resolveTaskListFilterRefs,
  resolveTaskRef,
  resolveTaskWriteRefs,
} from "../lib/entity-refs.js";
import {
  readIdempotencyKey,
  withIdempotency,
} from "../lib/idempotency.js";
import {
  readDocumentSection,
  replaceDocumentSectionBody,
} from "../lib/document-sections.js";
import * as circleService from "../services/circle-domain.js";
import * as financeService from "../services/finance/finance.js";
import * as moneybirdBankSyncService from "../services/finance/moneybird-sync.js";
import * as cursorSettingsService from "../services/cursor-settings.js";
import * as moneybirdSettingsService from "../services/moneybird-settings.js";
import * as mapboxSettingsService from "../services/mapbox-settings.js";
import * as githubSettingsService from "../services/github-settings.js";
import * as agentmailSettingsService from "../services/agentmail-settings.js";
import * as emailThreadsService from "../services/email-threads.js";
import { MoneybirdApiError } from "../lib/moneybird-client.js";
import { MapboxApiError } from "../lib/mapbox-client.js";
import { AgentMailApiError } from "../lib/agentmail-client.js";
import { TransipApiError } from "../lib/transip-client.js";
import { blobReadsRequireLocalCore } from "../lib/r2-object-store.js";
import { CloudflareApiError } from "../lib/cloudflare-client.js";
import { subscribeEmailUpdated } from "../lib/email-inbox-events.js";
import { subscribeAgentPresence } from "../lib/agent-presence-events.js";
import {
  isWorkspaceUpdatedKind,
  publishDocumentWorkspaceUpdated,
  publishEntityWorkspaceUpdated,
  publishMeetingWorkspaceUpdated,
  publishProjectWorkspaceUpdated,
  publishProjectUpdateWorkspaceUpdated,
  publishTaskWorkspaceUpdated,
  subscribeWorkspaceUpdated,
} from "../lib/workspace-events.js";
import {
  notifyPeerOfDocumentWrite,
  notifyPeerOfEntityWrite,
} from "../services/core-replication/nudge.js";
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
import * as crmGroupsService from "../services/crm-groups.js";
import * as crmRelationshipLabelsService from "../services/crm-relationship-labels.js";
import * as crmActivitiesService from "../services/crm-activities.js";
import * as portalContactLogsService from "../services/portal-contact-logs.js";
import * as projectUpdatesService from "../services/project-updates.js";
import * as githubService from "../services/github.js";
import { resolveGithubAccessToken } from "../services/github-auth.js";
import * as projectFsService from "../services/project-fs.js";
import * as projectVaultService from "../services/project-vault.js";
import * as taskActivityService from "../services/task-activities.js";
import * as taskAgentPresenceService from "../services/task-agent-presence.js";
import * as taskCommentService from "../services/task-comments.js";
import * as taskImageService from "../services/task-images.js";
import * as taskAttachmentService from "../services/task-attachments.js";
import * as taskProjectService from "../services/tasks-projects.js";
import {
  recordAreaRestSyncEvent,
  recordBankAccountRestSyncEvent,
  recordCashflowPlannerRestSyncEvent,
  recordContactRestSyncEvent,
  recordContactRelationshipRestSyncEvent,
  recordCrmActivityRestSyncEvent,
  recordCrmGroupMemberRestSyncEvent,
  recordCrmGroupRestSyncEvent,
  recordCrmRelationshipLabelRestSyncEvent,
  recordDocumentRestSyncEvent,
  loadContactRelationshipRow,
  loadCrmActivityRow,
  loadCrmGroupMemberRow,
  loadCrmGroupRow,
  loadCrmRelationshipLabelRow,
  recordEmailThreadCommentRestSyncEvent,
  recordEmailThreadRestSyncEvent,
  recordFinancialCategoryRestSyncEvent,
  recordFinancialGoalRestSyncEvent,
  recordFinancialRecurringRestSyncEvent,
  recordFinancialTransactionRestSyncEvent,
  recordHabitRestSyncEvent,
  recordLetterRestSyncEvent,
  buildLetterSyncPayloadFromRow,
  recordMeetingDerivedCrmActivityRestSyncEvents,
  recordMeetingRestSyncEvent,
  recordMentionRestSyncEvent,
  recordOrganizationRestSyncEvent,
  recordProjectRestSyncEvent,
  recordTaskCommentRestSyncEvent,
  recordTaskActivityRestSyncEvent,
  recordTaskRestSyncEvent,
  recordWorkspaceSettingRestSyncEvent,
} from "../services/sync.js";
import { newId } from "../lib/crypto.js";
import { db } from "../db/index.js";
import { writeActorFromAuth, writeActorForComment } from "../lib/write-actor.js";
import {
  buildAreaRestPayload,
  buildBankAccountRestPayload,
  buildCashflowPlannerRestPayload,
  buildContactRestPayload,
  buildContactRelationshipRestPayload,
  buildCrmActivityRestPayload,
  buildCrmGroupMemberRestPayload,
  buildCrmGroupRestPayload,
  buildCrmRelationshipLabelRestPayload,
  buildDocumentRestPayload,
  buildEmailThreadCommentRestPayload,
  buildEmailThreadRestPayload,
  buildFinancialCategoryRestPayload,
  buildFinancialGoalRestPayload,
  buildFinancialRecurringRestPayload,
  buildFinancialTransactionRestPayload,
  buildHabitRestPayload,
  buildLetterRestPayload,
  buildMeetingRestPayload,
  buildMentionRestPayload,
  buildOrganizationRestPayload,
  buildProjectRestPayload,
  buildTaskActivityRestPayload,
  buildTaskCommentRestPayload,
  buildTaskRestPayload,
  buildWorkspaceSettingRestPayload,
  commitRestEntityWrite,
  commitRestEntityWriteBatch,
  isRestLeaderFirstWrite,
} from "../services/rest-leader-write.js";
import {
  commitDocumentContentLeaderFirst,
  commitDocumentPropertiesLeaderFirst,
} from "../services/core-replication/leader-mutations.js";
import { emitHabitTaskSyncChanges } from "../services/habit-task-sync.js";
import * as vaultSettingsService from "../services/vault-settings.js";
import * as whoopService from "../services/whoop.js";
import * as pushInboxTriageService from "../services/push-inbox-triage.js";
import * as transipDomainsSyncService from "../services/transip-domains-sync.js";
import * as transipSettingsService from "../services/transip-settings.js";
import * as cloudflareZonesSyncService from "../services/cloudflare-zones-sync.js";
import * as cloudflareSettingsService from "../services/cloudflare-settings.js";
import * as cloudflareZoneOpsService from "../services/cloudflare-zone-ops.js";
import type { SyncEntity } from "../lib/sync-constants.js";
import {
  TaskRow, areaSchema, avatarEntityToSyncEntity, contactSchema, contactSocialAccountSchema, emitBackfilledHabitSync, emitLetterMetadataSync, idListSchema, letterSchema, meetingWeekdayHoursEntrySchema, meetingWeekdayHoursSlotSchema, nudgeContactLive, nudgeContactRelationshipLive, nudgeCrmActivityLive, nudgeCrmGroupLive, nudgeCrmGroupMemberLive, nudgeCrmRelationshipLabelLive, nudgeOrganizationLive, organizationSchema, prepareContactWriteBody, publishDocumentLiveFromAgent, publishMeetingLive, publishProjectLive, publishTaskLive, reorderSchema, requireResolvedRef, routeContactId, routeOrganizationId, routeProjectId, routeTaskId, sanitizeWorkspaceSettings, taskWithKey, tasksWithKeys, updateMeetingSchedulingSettingsSchema, withAuth
} from "./route-shared.js";

export function registerProjectRoutes(app: Hono) {
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
        throw error;
      }
    },
  );

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

  app.get("/api/v1/github/status", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const status = await githubService.getGithubConnectionStatus(token);
      return c.json(status);
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        if (
          error.code === "github_oauth_missing" ||
          error.code === "github_oauth_unavailable" ||
          error.code === "github_token_missing" ||
          error.code === "github_auth_required"
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

  app.get("/api/v1/transip/status", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    return c.json(await transipSettingsService.getTransipStatus(auth.workspaceId));
  });

  app.post("/api/v1/transip/domains/sync", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    try {
      const result = await transipDomainsSyncService.syncTransipDomains(
        auth.workspaceId,
      );
      for (const project of result.createdProjects) {
        publishProjectLive(auth, project.id, "upsert");
      }
      for (const projectId of result.healedProjectIds) {
        publishProjectLive(auth, projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/v1/transip/domains/:domainName", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    try {
      const detail = await transipDomainsSyncService.getTransipDomainDetail(
        auth.workspaceId,
        decodeURIComponent(domainName),
      );
      return c.json(detail);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/v1/transip/domains/:domainName/tags", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const tags = Array.isArray((body as { tags?: unknown } | null)?.tags)
      ? ((body as { tags: unknown[] }).tags
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean))
      : null;
    if (tags == null) {
      return c.json(
        { error: "tags must be an array of strings", code: "bad_request" },
        400,
      );
    }
    try {
      const result = await transipDomainsSyncService.updateTransipDomainTags(
        auth.workspaceId,
        decodeURIComponent(domainName),
        tags,
      );
      if (result.projectId) {
        publishProjectLive(auth, result.projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/v1/transip/domains/:domainName/contacts", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateTransipDomainContactsInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "contacts must be a non-empty array", code: "bad_request" },
        400,
      );
    }
    try {
      const result = await transipDomainsSyncService.updateTransipDomainContacts(
        auth.workspaceId,
        decodeURIComponent(domainName),
        parsed.data.contacts,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/v1/transip/domains/:domainName/nameservers", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateTransipDomainNameserversInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "nameservers must be an array of 2–13 entries",
          code: "bad_request",
        },
        400,
      );
    }
    try {
      const result =
        await transipDomainsSyncService.updateTransipDomainNameservers(
          auth.workspaceId,
          decodeURIComponent(domainName),
          parsed.data.nameservers,
        );
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.get("/api/v1/cloudflare/status", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    return c.json(
      await cloudflareSettingsService.getCloudflareStatus(auth.workspaceId),
    );
  });

  app.post("/api/v1/cloudflare/zones/match", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    try {
      const result = await cloudflareZonesSyncService.matchCloudflareZones(
        auth.workspaceId,
      );
      for (const entry of result.domains) {
        if (entry.action !== "updated" || !entry.projectId) continue;
        publishProjectLive(auth, entry.projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/v1/cloudflare/projects/:projectId/zone", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectId = c.req.param("projectId")?.trim() ?? "";
    if (!projectId) {
      return c.json(
        { error: "Project id required", code: "bad_request" },
        400,
      );
    }
    try {
      const result =
        await cloudflareZonesSyncService.ensureProjectCloudflareZone(
          auth.workspaceId,
          decodeURIComponent(projectId),
        );
      if (result.action === "updated") {
        publishProjectLive(auth, result.projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.status === 404
        ) {
          return c.json(
            { error: error.message, code: error.code },
            error.status as 401 | 403 | 404,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/v1/cloudflare/zones/:zoneId/dns-records", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    const zoneId = c.req.param("zoneId")?.trim() ?? "";
    if (!zoneId) {
      return c.json(
        { error: "Zone id required", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await cloudflareZoneOpsService.listCloudflareDnsRecords(
          auth.workspaceId,
          decodeURIComponent(zoneId),
        ),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.put("/api/v1/cloudflare/zones/:zoneId/dns-records/:recordId", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const zoneId = c.req.param("zoneId")?.trim() ?? "";
    const recordId = c.req.param("recordId")?.trim() ?? "";
    if (!zoneId || !recordId) {
      return c.json(
        { error: "Zone id and record id required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateCloudflareDnsRecordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid DNS record payload", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await cloudflareZoneOpsService.updateCloudflareDnsRecord(
          auth.workspaceId,
          decodeURIComponent(zoneId),
          decodeURIComponent(recordId),
          parsed.data,
        ),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/v1/cloudflare/zones/:zoneId/purge-cache", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const zoneId = c.req.param("zoneId")?.trim() ?? "";
    if (!zoneId) {
      return c.json(
        { error: "Zone id required", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await cloudflareZoneOpsService.purgeCloudflareCache(
          auth.workspaceId,
          decodeURIComponent(zoneId),
        ),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/v1/github/repositories", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    try {
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
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
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
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
      projectId,
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
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const sha = c.req.param("sha")?.trim();
    if (!sha) {
      return c.json(
        { error: "Invalid commit sha", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
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
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
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
      projectId,
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
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
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
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
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
      projectId,
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
      const token = await resolveGithubAccessToken(auth);
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
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
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
      projectId,
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
      const token = await resolveGithubAccessToken(auth);
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
