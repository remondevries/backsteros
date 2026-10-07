/**
 * task-document-routes routes (OS-73 split from routes.ts).
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
import { runAgentRetrieve } from "../services/agent-search.js";
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
import { assertCanSetAgentWorking } from "../lib/agent-working.js";
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

export function registerTaskDocumentRoutes(app: Hono) {
  app.get("/api/v1/tasks", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const url = new URL(c.req.url);
    const raw: Record<string, string | string[]> = {};
    for (const key of url.searchParams.keys()) {
      const all = url.searchParams.getAll(key);
      raw[key] = all.length <= 1 ? (all[0] ?? "") : all;
    }

    let parsed;
    try {
      parsed = parseTaskListQuery(raw);
    } catch (error) {
      if (error instanceof TaskFilterError) {
        return c.json(
          {
            error: error.message,
            code: error.code,
            field: error.field,
          },
          400,
        );
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      // OS-45: legacy `{ tasks }` unless paginated=true/cursor. Paginated-only
      // params are ignored here; tell the caller so it can opt in.
      const ignored = ignoredLegacyTaskListKeys(raw);
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      } else if (url.searchParams.size === 0) {
        c.header(
          "X-BacksterOS-Hint",
          "Full task list (all statuses). Prefer GET /tasks?paginated=true&projectId=...&status=... and read items.",
        );
      }
      // OS-58: resolve keys in filters (unknown refs stay unmatched → empty list).
      const resolved = await resolveTaskListFilterRefs(
        auth.workspaceId,
        parsed,
        { strict: false },
      );
      const rows = await taskProjectService.listTasks(auth.workspaceId, {
        projectId: resolved.projectIds,
        contactId: resolved.contactIds,
        assigneeId: resolved.assigneeIds,
        relatedContactId: resolved.relatedContactIds,
        relatedOrganizationId: resolved.relatedOrganizationIds,
        status: resolved.statuses,
        inbox:
          c.req.query("inbox") === undefined
            ? undefined
            : c.req.query("inbox") === "true",
        support:
          c.req.query("support") === undefined
            ? undefined
            : c.req.query("support") === "true",
        notification:
          c.req.query("notification") === undefined
            ? undefined
            : c.req.query("notification") === "true",
      });
      return c.json({ tasks: await tasksWithKeys(auth.workspaceId, rows) });
    }

    try {
      // OS-58: keys allowed; unknown project/assignee/contact/org → 400.
      const resolved = await resolveTaskListFilterRefs(
        auth.workspaceId,
        parsed,
        { strict: true },
      );
      const result = await taskProjectService.listTasksPaginated(
        auth.workspaceId,
        resolved,
      );
      // OS-57: surface the default terminal-status exclusion (also in body).
      if (taskListUsesDefaultStatusExclusion(resolved)) {
        c.header("X-BacksterOS-Hint", TASK_LIST_DEFAULT_EXCLUSION_HINT);
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof TaskFilterError) {
        return c.json(
          {
            error: error.message,
            code: error.code,
            field: error.field,
          },
          400,
        );
      }
      throw error;
    }
  });

  // Static task collection routes must be registered before /tasks/:id.
  app.get("/api/v1/tasks/due", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseDueTasksListQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "paginated") {
      const result = await taskProjectService.listDueTasksPaginated(
        auth.workspaceId,
        parsed,
      );
      return c.json(result);
    }

    const ignored = ignoredLegacyListKeys(raw, DUE_TASKS_LIST_PAGINATED_ONLY_KEYS);
    if (ignored.length && raw.limit == null) {
      c.header(
        "X-BacksterOS-Hint",
        `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
      );
    }
    const rows = await taskProjectService.listDueTasks(
      auth.workspaceId,
      parsed.before,
    );
    const limited = Number.isFinite(parsed.limit)
      ? rows.slice(0, parsed.limit)
      : rows;
    if (Number.isFinite(parsed.limit) && rows.length > parsed.limit) {
      c.header(
        "X-BacksterOS-Hint",
        `Limited to ${parsed.limit} rows. Add paginated=true for { items, nextCursor }.`,
      );
    }
    return c.json({ tasks: await tasksWithKeys(auth.workspaceId, limited) });
  });

  app.get("/api/v1/tasks/inbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const rows = await taskProjectService.listInboxTasks(auth.workspaceId);
    return c.json({ tasks: await tasksWithKeys(auth.workspaceId, rows) });
  });

  app.get("/api/v1/tasks/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const taskId = await routeTaskId(auth.workspaceId, c.req.param("id"));
    if (!taskId) {
      return c.json(notFound("Task"), 404);
    }
    const row = await taskProjectService.getTaskById(
      auth.workspaceId,
      taskId,
    );
    if (!row) {
      return c.json(notFound("Task"), 404);
    }

    const includeRaw = c.req.query("include") ?? "";
    const includes = new Set(
      includeRaw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    );
    let comments:
      | Array<ReturnType<typeof toTaskComment>>
      | undefined;
    if (includes.has("comments")) {
      const commentRows = await taskCommentService.listTaskComments(
        auth.workspaceId,
        taskId,
        db,
        { limit: 20 },
      );
      comments = (commentRows ?? []).map(toTaskComment);
    }

    return c.json(
      await taskWithKey(
        auth.workspaceId,
        row,
        comments ? { comments } : undefined,
      ),
    );
  });

  app.get("/api/v1/tasks/:id/documents", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);

    const taskId = await routeTaskId(auth.workspaceId, c.req.param("id"));
    if (!taskId) return c.json(notFound("Task"), 404);
    const rows = await documentService.listDocumentsForTask(
      auth.workspaceId,
      taskId,
    );
    if (rows === null) {
      return c.json(notFound("Task"), 404);
    }
    return c.json({ documents: rows.map(toDocument) });
  });

  app.get("/api/v1/tasks/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskId = await routeTaskId(auth.workspaceId, c.req.param("id"));
    if (!taskId) return c.json(notFound("Task"), 404);
    const result = await circleService.getTaskRelations(auth.workspaceId, taskId);
    return result ? c.json(result) : c.json(notFound("Task"), 404);
  });

  app.get("/api/v1/tasks/:id/project-updates", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth) && !requireScope("projects:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const task = await taskProjectService.getTaskById(auth.workspaceId, taskId);
    if (!task) {
      return c.json(notFound("Task"), 404);
    }
    const updates = await projectUpdatesService.listProjectUpdatesForRelatedTask(
      auth.workspaceId,
      taskId,
    );
    return c.json({ updates });
  });

  app.get(
    "/api/v1/activities",
    zValidator("query", listActivitiesQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const query = c.req.valid("query");
      const types = query.types
        ? query.types
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;
      const result = await taskActivityService.listActivities(auth.workspaceId, {
        taskId: query.taskId,
        projectId: query.projectId,
        types,
        includeDeleted: query.includeDeleted,
        limit: query.limit,
        cursor: query.cursor,
      });
      if (!result) {
        return c.json(
          notFound(query.taskId ? "Task" : "Project"),
          404,
        );
      }
      return c.json({
        activities: result.rows.map(toTaskActivity),
        nextCursor: result.nextCursor,
      });
    },
  );

  app.get("/api/v1/tasks/:id/comments", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const rows = await taskCommentService.listTaskComments(
      auth.workspaceId,
      taskId,
    );
    if (!rows) return c.json(notFound("Task"), 404);
    return c.json({ comments: rows.map(toTaskComment) });
  });

  app.get("/api/v1/tasks/:id/activities", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const rows = await taskActivityService.listTaskActivities(
      auth.workspaceId,
      taskId,
    );
    if (!rows) return c.json(notFound("Task"), 404);
    return c.json({ activities: rows.map(toTaskActivity) });
  });

  /** Open task timers across the workspace (latest activity is timer_started). */
  app.get("/api/v1/running-timers", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const timers = await taskActivityService.listOpenRunningTaskTimers(
      auth.workspaceId,
    );
    return c.json({
      timers: timers.map((timer) => ({
        taskId: timer.taskId,
        startedAt: timer.startedAt.toISOString(),
        title: timer.title,
        number: timer.number,
        status: timer.status,
        trackedDurationSeconds: timer.trackedDurationSeconds,
        trackedMinutes: timer.trackedMinutes,
        projectKey: timer.projectKey,
      })),
    });
  });

  app.get(
    "/api/v1/agent-presence",
    zValidator("query", listTaskAgentPresenceQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const query = c.req.valid("query");
      const presence = await taskAgentPresenceService.listLiveTaskAgentPresence(
        auth.workspaceId,
        { projectId: query.projectId },
      );
      return c.json({ presence });
    },
  );

  /** Live agent-working hints for open shells (instant pulse; poll is fallback). */
  app.get("/api/v1/agent-presence/events", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const workspaceId = auth.workspaceId;
    return streamSSE(c, async (stream) => {
      let closed = false;
      let pendingWrites = 0;
      const MAX_PENDING_WRITES = 16;
      const unsubscribe = subscribeAgentPresence(workspaceId, (event) => {
        if (closed || pendingWrites >= MAX_PENDING_WRITES) return;
        pendingWrites += 1;
        void stream
          .writeSSE({
            event: "agent.presence",
            data: JSON.stringify({
              taskId: event.taskId,
              live: event.live,
            }),
          })
          .catch(() => {
            closed = true;
            unsubscribe();
          })
          .finally(() => {
            pendingWrites = Math.max(0, pendingWrites - 1);
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

  app.put(
    "/api/v1/tasks/:id/agent-presence",
    zValidator("json", upsertTaskAgentPresenceSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const body = c.req.valid("json");
      const presence = await taskAgentPresenceService.upsertTaskAgentPresence(
        auth.workspaceId,
        taskId,
        {
          source: body.source,
          sessionId: body.sessionId,
        },
      );
      if (!presence) return c.json(notFound("Task"), 404);
      return c.json(presence);
    },
  );

  app.delete("/api/v1/tasks/:id/agent-presence", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const task = await taskProjectService.getTaskById(auth.workspaceId, taskId);
    if (!task) return c.json(notFound("Task"), 404);
    await taskAgentPresenceService.clearTaskAgentPresence(
      auth.workspaceId,
      taskId,
    );
    return c.body(null, 204);
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
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      if (isRestLeaderFirstWrite()) {
        const existingTask = await taskProjectService.getTaskById(
          auth.workspaceId,
          taskId,
        );
        if (!existingTask) return c.json(notFound("Task"), 404);
        const activityId = newId();
        const actor = writeActorFromAuth(auth);
        const profile = await taskCommentService.resolveWriteActorProfile(
          auth.workspaceId,
          actor,
          db,
        );
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task_activity",
          entityId: activityId,
          operation: "upsert",
          payload: buildTaskActivityRestPayload(activityId, taskId, {
            type: body.type,
            data: body.data ?? {},
            actorUserId: profile.userId,
            actorContactId: profile.contactId,
            actorEmail: profile.email,
            actorName: profile.name,
          }),
        });
        const row = await taskActivityService.getTaskActivityRow(
          auth.workspaceId,
          activityId,
        );
        if (!row) {
          return c.json(
            { error: "Activity create failed", code: "internal" },
            500,
          );
        }
        return c.json(toTaskActivity(row), 201);
      }
      const row = await taskActivityService.createClientTaskActivity(
        auth.workspaceId,
        taskId,
        body.type,
        body.data ?? {},
        writeActorFromAuth(auth),
      );
      if (!row) return c.json(notFound("Task"), 404);
      await recordTaskActivityRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toTaskActivity(row), 201);
    },
  );

  app.delete("/api/v1/tasks/:taskId/activities/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const taskIdRaw = c.req.param("taskId");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const activityId = c.req.param("id");
    const existing = await taskActivityService.getTaskActivityRow(
      auth.workspaceId,
      activityId,
    );
    if (
      !existing ||
      existing.taskId !== taskId ||
      (existing.type !== "timer_started" && existing.type !== "timer_stopped")
    ) {
      return c.json(notFound("Activity"), 404);
    }

    const deleted = await taskActivityService.deleteTaskTimerSession(
      auth.workspaceId,
      taskId,
      activityId,
    );
    if (!deleted) return c.json(notFound("Activity"), 404);
    await recordTaskActivityRestSyncEvent(
      auth.workspaceId,
      deleted.start,
      "delete",
    );
    if (deleted.stop) {
      await recordTaskActivityRestSyncEvent(
        auth.workspaceId,
        deleted.stop,
        "delete",
      );
    }
    const { notifyPeerOfEntityWrite } = await import(
      "../services/core-replication/nudge.js"
    );
    const { publishWorkspaceUpdatedFromSyncEvent } = await import(
      "../services/core-replication/sync-event-live-publish.js"
    );
    publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
      entity: "task_activity",
      entityId: deleted.start.id,
      operation: "delete",
      payload: { task_id: taskId },
    });
    if (deleted.stop) {
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_activity",
        entityId: deleted.stop.id,
        operation: "delete",
        payload: { task_id: taskId },
      });
    }
    notifyPeerOfEntityWrite({
      workspaceId: auth.workspaceId,
      reason: "rest",
      entity: "task_activity",
      entityId: deleted.start.id,
      taskId,
      operation: "delete",
    });
    return c.body(null, 204);
  });

  app.patch(
    "/api/v1/tasks/:taskId/activities/:id",
    zValidator("json", updateTaskTimerSessionActorSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const taskIdRaw = c.req.param("taskId");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const activityId = c.req.param("id");
      const body = c.req.valid("json");
      const updated = await taskActivityService.updateTaskTimerSessionActor(
        auth.workspaceId,
        taskId,
        activityId,
        body.actorContactId,
      );
      if (!updated) return c.json(notFound("Activity"), 404);

      await recordTaskActivityRestSyncEvent(
        auth.workspaceId,
        updated.start,
        "upsert",
      );
      if (updated.stop) {
        await recordTaskActivityRestSyncEvent(
          auth.workspaceId,
          updated.stop,
          "upsert",
        );
      }
      const { notifyPeerOfEntityWrite } = await import(
        "../services/core-replication/nudge.js"
      );
      const { publishWorkspaceUpdatedFromSyncEvent } = await import(
        "../services/core-replication/sync-event-live-publish.js"
      );
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_activity",
        entityId: updated.start.id,
        operation: "upsert",
        payload: { task_id: taskId },
      });
      if (updated.stop) {
        publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
          entity: "task_activity",
          entityId: updated.stop.id,
          operation: "upsert",
          payload: { task_id: taskId },
        });
      }
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "rest",
        entity: "task_activity",
        entityId: updated.start.id,
        taskId,
        operation: "upsert",
      });
      return c.json(toTaskActivity(updated.stop ?? updated.start));
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
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const actor = writeActorForComment(auth, {
        activityActor: body.activityActor,
        authorContactId: body.authorContactId,
      });

      const runCreate = async () => {
        if (isRestLeaderFirstWrite()) {
          const existingTask = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!existingTask) {
            return {
              status: 404 as const,
              body: notFound("Task"),
            };
          }
          const commentId = newId();
          const profile = await taskCommentService.resolveWriteActorProfile(
            auth.workspaceId,
            actor,
            db,
          );
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task_comment",
            entityId: commentId,
            operation: "upsert",
            payload: buildTaskCommentRestPayload(commentId, taskId, {
              body: body.body,
              parentCommentId: body.parentCommentId,
              authorUserId: profile.userId,
              authorContactId: profile.contactId,
              authorEmail: profile.email,
            }),
          });
          const row = await taskCommentService.getTaskCommentRow(
            auth.workspaceId,
            commentId,
          );
          if (!row) {
            return {
              status: 500 as const,
              body: { error: "Comment create failed", code: "internal" },
            };
          }
          return { status: 201 as const, body: toTaskComment(row) };
        }
        const row = await taskCommentService.createTaskComment(
          auth.workspaceId,
          taskId,
          body,
          actor,
        );
        if (!row) {
          return { status: 404 as const, body: notFound("Task") };
        }
        await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
        const { notifyPeerOfEntityWrite } = await import(
          "../services/core-replication/nudge.js"
        );
        const { publishWorkspaceUpdatedFromSyncEvent } = await import(
          "../services/core-replication/sync-event-live-publish.js"
        );
        publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
          entity: "task_comment",
          entityId: row.id,
          operation: "upsert",
          payload: { task_id: taskId },
        });
        notifyPeerOfEntityWrite({
          workspaceId: auth.workspaceId,
          reason: "rest",
          entity: "task_comment",
          entityId: row.id,
          taskId,
          operation: "upsert",
        });
        return { status: 201 as const, body: toTaskComment(row) };
      };

      const idempotencyKey = readIdempotencyKey(
        c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key"),
      );
      const scope =
        auth.apiKeyId != null
          ? `api_key:${auth.apiKeyId}:task_comment`
          : `ws:${auth.workspaceId}:task_comment`;
      const result = idempotencyKey
        ? await withIdempotency(scope, idempotencyKey, runCreate)
        : await runCreate();
      return c.json(
        result.body,
        result.status as 201 | 404 | 500,
      );
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
      const taskIdRaw = c.req.param("taskId");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      const commentId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!existing || existing.taskId !== taskId) {
          return c.json(notFound("Comment"), 404);
        }
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "task_comment",
          entityId: commentId,
          operation: "upsert",
          payload: buildTaskCommentRestPayload(commentId, taskId, patch),
        });
        const row = await taskCommentService.getTaskCommentRow(
          auth.workspaceId,
          commentId,
        );
        if (!row) return c.json(notFound("Comment"), 404);
        return c.json(toTaskComment(row));
      }
      const row = await taskCommentService.updateTaskComment(
        auth.workspaceId,
        taskId,
        commentId,
        patch,
      );
      if (!row) return c.json(notFound("Comment"), 404);
      await recordTaskCommentRestSyncEvent(auth.workspaceId, row, "upsert");
      const { notifyPeerOfEntityWrite } = await import(
        "../services/core-replication/nudge.js"
      );
      const { publishWorkspaceUpdatedFromSyncEvent } = await import(
        "../services/core-replication/sync-event-live-publish.js"
      );
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_comment",
        entityId: row.id,
        operation: "upsert",
        payload: { task_id: taskId },
      });
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "rest",
        entity: "task_comment",
        entityId: row.id,
        taskId,
        operation: "upsert",
      });
      return c.json(toTaskComment(row));
    },
  );

  app.delete("/api/v1/tasks/:taskId/comments/:id", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const commentId = c.req.param("id");
    const taskIdRaw = c.req.param("taskId");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const existing = await taskCommentService.getTaskCommentRow(
      auth.workspaceId,
      commentId,
    );
    if (!existing || existing.taskId !== taskId) {
      return c.json(notFound("Comment"), 404);
    }
    if (isRestLeaderFirstWrite()) {
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "task_comment",
        entityId: commentId,
        operation: "delete",
        payload: { id: commentId, task_id: taskId },
      });
      return c.body(null, 204);
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
      const { notifyPeerOfEntityWrite } = await import(
        "../services/core-replication/nudge.js"
      );
      const { publishWorkspaceUpdatedFromSyncEvent } = await import(
        "../services/core-replication/sync-event-live-publish.js"
      );
      publishWorkspaceUpdatedFromSyncEvent(auth.workspaceId, {
        entity: "task_comment",
        entityId: commentId,
        operation: "delete",
        payload: { task_id: taskId },
      });
      notifyPeerOfEntityWrite({
        workspaceId: auth.workspaceId,
        reason: "rest",
        entity: "task_comment",
        entityId: commentId,
        taskId,
        operation: "delete",
      });
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

      const runCreate = async (): Promise<{
        status: number;
        body: unknown;
      }> => {
        try {
          const body = c.req.valid("json");
          const {
            activityActor,
            id: preferredId,
            comment: inlineComment,
            projectKey,
            ...createFields
          } = body;
          const resolvedRefs = await resolveTaskWriteRefs(auth.workspaceId, {
            projectId: createFields.projectId,
            projectKey,
            contactId: createFields.contactId,
            assigneeId: createFields.assigneeId,
            relatedContactIds: createFields.relatedContactIds,
            relatedOrganizationIds: createFields.relatedOrganizationIds,
            linkedEmailIds: createFields.linkedEmailIds,
          });
          const createInput = {
            ...createFields,
            ...resolvedRefs,
          };
          if (preferredId) {
            const existing = await taskProjectService.getTaskById(
              auth.workspaceId,
              preferredId,
            );
            if (existing) {
              return {
                status: 200,
                body: await taskWithKey(auth.workspaceId, existing),
              };
            }
          }

          const actor = writeActorFromAuth(auth, activityActor);
          let row;
          let commentMapped: ReturnType<typeof toTaskComment> | undefined;

          if (isRestLeaderFirstWrite()) {
            const taskId = preferredId ?? newId();
            const changes: Array<{
              entity: "task" | "task_comment";
              entityId: string;
              operation: "upsert";
              payload: Record<string, unknown>;
            }> = [
              {
                entity: "task",
                entityId: taskId,
                operation: "upsert",
                payload: buildTaskRestPayload(taskId, createInput),
              },
            ];
            let commentId: string | null = null;
            if (inlineComment?.body) {
              commentId = newId();
              const profile = await taskCommentService.resolveWriteActorProfile(
                auth.workspaceId,
                writeActorForComment(auth, { activityActor }),
                db,
              );
              changes.push({
                entity: "task_comment",
                entityId: commentId,
                operation: "upsert",
                payload: buildTaskCommentRestPayload(commentId, taskId, {
                  body: inlineComment.body,
                  authorUserId: profile.userId,
                  authorContactId: profile.contactId,
                  authorEmail: profile.email,
                }),
              });
            }
            if (changes.length === 1) {
              await commitRestEntityWrite({
                workspaceId: auth.workspaceId,
                entity: "task",
                entityId: taskId,
                operation: "upsert",
                payload: changes[0]!.payload,
              });
            } else {
              await commitRestEntityWriteBatch({
                workspaceId: auth.workspaceId,
                changes,
              });
            }
            row = await taskProjectService.getTaskById(
              auth.workspaceId,
              taskId,
            );
            if (!row) {
              throw new Error("TASK_CREATE_FAILED");
            }
            if (commentId) {
              const commentRow = await taskCommentService.getTaskCommentRow(
                auth.workspaceId,
                commentId,
              );
              if (commentRow) commentMapped = toTaskComment(commentRow);
            }
          } else {
            const created = await db.transaction(async (tx) => {
              const taskRow = await taskProjectService.createTask(
                auth.workspaceId,
                createInput,
                preferredId,
                tx,
                actor,
                {
                  authKind:
                    auth.kind === "api_key" || auth.kind === "local_shell"
                      ? auth.kind
                      : undefined,
                },
              );
              let commentRow = null;
              if (inlineComment?.body) {
                commentRow = await taskCommentService.createTaskComment(
                  auth.workspaceId,
                  taskRow.id,
                  { body: inlineComment.body, activityActor },
                  writeActorForComment(auth, { activityActor }),
                  tx,
                );
              }
              return { taskRow, commentRow };
            });
            row = created.taskRow;
            await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
            if (created.commentRow) {
              await recordTaskCommentRestSyncEvent(
                auth.workspaceId,
                created.commentRow,
                "upsert",
              );
              commentMapped = toTaskComment(created.commentRow);
            }
          }

          publishTaskLive(auth, row.id, {
            projectId: row.projectId ?? null,
            operation: "upsert",
          });
          return {
            status: 201,
            body: await taskWithKey(
              auth.workspaceId,
              row,
              commentMapped ? { comment: commentMapped } : undefined,
            ),
          };
        } catch (error) {
          if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
            return { status: 404, body: notFound("Project") };
          }
          if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") {
            return {
              status: 400,
              body: {
                error: "Assignee not found",
                code: "assignee_not_found",
              },
            };
          }
          if (
            error instanceof Error &&
            error.message === "RELATED_CONTACT_NOT_FOUND"
          ) {
            return {
              status: 400,
              body: {
                error: "Related contact not found",
                code: "related_contact_not_found",
              },
            };
          }
          if (
            error instanceof Error &&
            error.message === "RELATED_ORGANIZATION_NOT_FOUND"
          ) {
            return {
              status: 400,
              body: {
                error: "Related organization not found",
                code: "related_organization_not_found",
              },
            };
          }
          if (
            error instanceof Error &&
            error.message === "TASK_LABEL_NOT_FOUND"
          ) {
            return {
              status: 400,
              body: { error: "Label not found", code: "task_label_not_found" },
            };
          }
          if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
            return { status: 404, body: notFound("Contact") };
          }
          throw error;
        }
      };

      const idempotencyKey = readIdempotencyKey(
        c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key"),
      );
      const scope =
        auth.apiKeyId != null
          ? `api_key:${auth.apiKeyId}:task`
          : `ws:${auth.workspaceId}:task`;
      const result = idempotencyKey
        ? await withIdempotency(scope, idempotencyKey, runCreate)
        : await runCreate();
      return c.json(result.body, result.status as 200 | 201 | 400 | 404);
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
        const {
          activityActor,
          agentInboxApproved,
          comment: inlineComment,
          projectKey,
          ...patchFields
        } = body;
        const taskIdRaw = c.req.param("id");
        const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
        if (!taskId) return c.json(notFound("Task"), 404);

        const existingForAgentWorking =
          patchFields.agentWorkingContactId !== undefined ||
          patchFields.agentWorkingLabel !== undefined ||
          patchFields.status === "in_progress"
            ? await taskProjectService.getTaskById(auth.workspaceId, taskId)
            : null;
        if (
          (patchFields.agentWorkingContactId !== undefined ||
            patchFields.agentWorkingLabel !== undefined) &&
          !existingForAgentWorking
        ) {
          return c.json(notFound("Task"), 404);
        }

        const canSetAnyAgentWorking =
          isOwnerShellAuth(auth) ||
          (await apiKeyService.apiKeyContactIsWorkspaceOwner(auth));
        if (
          patchFields.agentWorkingContactId !== undefined ||
          patchFields.agentWorkingLabel !== undefined
        ) {
          assertCanSetAgentWorking({
            canSetAny: canSetAnyAgentWorking,
            authContactId: auth.contactId,
            existingContactId:
              existingForAgentWorking?.agentWorkingContactId ?? null,
            nextContactId: patchFields.agentWorkingContactId,
            touchesLabel: patchFields.agentWorkingLabel !== undefined,
          });
        }

        const resolvedRefs = await resolveTaskWriteRefs(auth.workspaceId, {
          projectId: patchFields.projectId,
          projectKey,
          contactId: patchFields.contactId,
          assigneeId: patchFields.assigneeId,
          relatedContactIds: patchFields.relatedContactIds,
          relatedOrganizationIds: patchFields.relatedOrganizationIds,
          linkedEmailIds: patchFields.linkedEmailIds,
        });
        // Agent persona keys auto-claim working when they move a task in_progress
        // (OS-96). Owner keys and local shell leave the marker alone unless set.
        const autoClaimWorking =
          patchFields.status === "in_progress" &&
          patchFields.agentWorkingContactId === undefined &&
          auth.kind === "api_key" &&
          Boolean(auth.contactId) &&
          !canSetAnyAgentWorking;
        const patch = {
          ...patchFields,
          ...resolvedRefs,
          ...(autoClaimWorking
            ? { agentWorkingContactId: auth.contactId }
            : {}),
        };
        const actor = writeActorFromAuth(auth, activityActor);
        let row;
        let commentMapped: ReturnType<typeof toTaskComment> | undefined;

        if (isRestLeaderFirstWrite()) {
          const existing = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!existing) {
            return c.json(notFound("Task"), 404);
          }
          const changes: Array<{
            entity: "task" | "task_comment";
            entityId: string;
            operation: "upsert" | "patch";
            payload: Record<string, unknown>;
          }> = [
            {
              entity: "task",
              entityId: taskId,
              operation: "upsert",
              payload: buildTaskRestPayload(taskId, patch, {
                agentInboxApproved,
                allowAgentInboxApproval: isOwnerShellAuth(auth),
              }),
            },
          ];
          let commentId: string | null = null;
          if (inlineComment?.body) {
            commentId = newId();
            const profile = await taskCommentService.resolveWriteActorProfile(
              auth.workspaceId,
              writeActorForComment(auth, { activityActor }),
              db,
            );
            changes.push({
              entity: "task_comment",
              entityId: commentId,
              operation: "upsert",
              payload: buildTaskCommentRestPayload(commentId, taskId, {
                body: inlineComment.body,
                authorUserId: profile.userId,
                authorContactId: profile.contactId,
                authorEmail: profile.email,
              }),
            });
          }
          if (changes.length === 1) {
            await commitRestEntityWrite({
              workspaceId: auth.workspaceId,
              entity: "task",
              entityId: taskId,
              operation: "upsert",
              payload: changes[0]!.payload,
            });
          } else {
            await commitRestEntityWriteBatch({
              workspaceId: auth.workspaceId,
              changes,
            });
          }
          row = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (commentId) {
            const commentRow = await taskCommentService.getTaskCommentRow(
              auth.workspaceId,
              commentId,
            );
            if (commentRow) commentMapped = toTaskComment(commentRow);
          }
        } else {
          const updated = await db.transaction(async (tx) => {
            const taskRow = await taskProjectService.updateTask(
              auth.workspaceId,
              taskId,
              { ...patch, agentInboxApproved },
              tx,
              actor,
              { allowAgentInboxApproval: isOwnerShellAuth(auth) },
            );
            if (!taskRow) return { taskRow: null, commentRow: null };
            let commentRow = null;
            if (inlineComment?.body) {
              commentRow = await taskCommentService.createTaskComment(
                auth.workspaceId,
                taskId,
                { body: inlineComment.body, activityActor },
                writeActorForComment(auth, { activityActor }),
                tx,
              );
            }
            return { taskRow, commentRow };
          });
          row = updated.taskRow;
          if (!row) {
            return c.json(notFound("Task"), 404);
          }
          await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
          if (updated.commentRow) {
            await recordTaskCommentRestSyncEvent(
              auth.workspaceId,
              updated.commentRow,
              "upsert",
            );
            commentMapped = toTaskComment(updated.commentRow);
          }
        }

        if (row) {
          publishTaskLive(auth, row.id, {
            projectId: row.projectId ?? null,
            operation: "upsert",
          });
        }
        return c.json(
          await taskWithKey(
            auth.workspaceId,
            row!,
            commentMapped ? { comment: commentMapped } : undefined,
          ),
        );
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
        if (
          error instanceof Error &&
          error.message === "RELATED_CONTACT_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Related contact not found",
              code: "related_contact_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "RELATED_ORGANIZATION_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Related organization not found",
              code: "related_organization_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "TASK_LABEL_NOT_FOUND"
        ) {
          return c.json(
            { error: "Label not found", code: "task_label_not_found" },
            400,
          );
        }
        if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        if (
          error instanceof Error &&
          error.message === "AGENT_WORKING_CONTACT_NOT_FOUND"
        ) {
          return c.json(
            {
              error: "Agent working contact not found",
              code: "agent_working_contact_not_found",
            },
            400,
          );
        }
        if (
          error instanceof Error &&
          error.message === "AGENT_WORKING_FORBIDDEN"
        ) {
          return c.json(
            {
              error:
                "Agents may only set or clear their own working marker",
              code: "agent_working_forbidden",
            },
            403,
          );
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

    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
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
      publishTaskLive(auth, taskId, {
        projectId: existing.projectId ?? null,
        operation: "delete",
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
    publishTaskLive(auth, row.id, {
      projectId: row.projectId ?? null,
      operation: "delete",
    });
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
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
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
        taskId,
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
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const result = await taskImageService.getTaskImage(
      auth.workspaceId,
      taskId,
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

  app.get("/api/v1/tasks/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const attachments = await taskAttachmentService.listTaskAttachments(
      auth.workspaceId,
      taskId,
    );
    return attachments
      ? c.json({ attachments })
      : c.json(notFound("Task"), 404);
  });

  app.post("/api/v1/tasks/:id/attachments", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Task attachments can only be stored on local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000) {
      return c.json(
        {
          error: "Attachment must be between 1 byte and 25 MB",
          code: "bad_request",
        },
        400,
      );
    }
    const filename = (c.req.header("X-Filename") ?? "attachment.bin").trim();
    if (!filename) {
      return c.json(
        { error: "X-Filename is required", code: "bad_request" },
        400,
      );
    }
    const contentType = resolveTaskAttachmentContentType(
      c.req.header("Content-Type"),
      filename,
    );
    const attachment = await taskAttachmentService.createTaskAttachment(
      auth.workspaceId,
      taskId,
      bytes,
      filename,
      contentType,
    );
    return attachment
      ? c.json(attachment, 201)
      : c.json(notFound("Task"), 404);
  });

  app.post(
    "/api/v1/tasks/:id/attachments/reorder",
    zValidator("json", reorderTaskAttachmentsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const taskIdRaw = c.req.param("id");
      const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
      if (!taskId) return c.json(notFound("Task"), 404);
      try {
        const rows = await taskAttachmentService.reorderTaskAttachments(
          auth.workspaceId,
          taskId,
          c.req.valid("json").orderedIds,
        );
        if (!rows) return c.json(notFound("Task"), 404);
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

  app.get("/api/v1/tasks/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Task attachments are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    const result = await taskAttachmentService.getTaskAttachment(
      auth.workspaceId,
      taskId,
      c.req.param("attachmentId"),
    );
    if (!result) return c.json(notFound("Attachment"), 404);
    c.header("Content-Type", result.row.contentType);
    c.header(
      "Content-Disposition",
      `inline; filename="${(result.row.originalFilename || "attachment.bin").replaceAll('"', "")}"`,
    );
    return c.body(Uint8Array.from(result.bytes).buffer);
  });

  app.patch("/api/v1/tasks/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
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
    const row = await taskAttachmentService.updateTaskAttachment(
      auth.workspaceId,
      taskId,
      c.req.param("attachmentId"),
      parsed.data,
    );
    return row ? c.json(row) : c.json(notFound("PDF"), 404);
  });

  app.delete("/api/v1/tasks/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
    const row = await taskAttachmentService.deleteTaskAttachment(
      auth.workspaceId,
      taskId,
      c.req.param("attachmentId"),
    );
    return row ? c.json(row) : c.json(notFound("PDF"), 404);
  });

  app.get(
    "/api/v1/documents",
    zValidator("query", listDocumentsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      const query = c.req.valid("query");
      const typeValues = parseMultiQueryValues(c.req.queries("type") ?? []);
      try {
        for (const value of typeValues) {
          assertDocumentListTypeValue(value);
        }
      } catch (error) {
        if (error instanceof ListQueryError) {
          return c.json(listQueryErrorBody(error), 400);
        }
        throw error;
      }
      const typeFilter = parseDocumentListTypeFilter(typeValues);
      if (typeFilter.kind === "mixed") {
        return c.json(
          { error: typeFilter.message, code: "bad_request", field: "type" },
          400,
        );
      }

      const audience = parseMultiQueryValues(c.req.queries("audience") ?? []);
      const status = parseMultiQueryValues(c.req.queries("status") ?? []);
      const { limit, appliedDefault } = parseDocumentsListLimit(
        query.limit != null ? String(query.limit) : undefined,
      );
      if (appliedDefault) {
        c.header(
          "X-BacksterOS-Hint",
          `Default limit=${DOCUMENTS_DEFAULT_LIMIT} applied. Pass limit=1..200 explicitly.`,
        );
      }

      let projectId = query.projectId;
      if (projectId) {
        try {
          projectId = await requireResolvedRef(
            auth.workspaceId,
            projectId,
            "projectId",
          );
        } catch (error) {
          if (error instanceof ListQueryError) {
            return c.json(listQueryErrorBody(error), 400);
          }
          throw error;
        }
      }

      const rows = await documentService.listDocuments(auth.workspaceId, {
        type:
          typeFilter.kind === "documentType" ? typeFilter.values : undefined,
        propertyType:
          typeFilter.kind === "propertyType" ? typeFilter.values : undefined,
        audience: audience.length ? audience : undefined,
        status: status.length ? status : undefined,
        projectId,
        limit,
        offset: query.offset,
      });
      return c.json({ documents: rows.map(toDocument) });
    },
  );

  app.get(
    "/api/v1/documents/retrieve",
    zValidator("query", documentRetrievalQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      const query = c.req.valid("query");
      const result = await runAgentRetrieve({
        workspaceId: auth.workspaceId,
        q: query.q,
        propertyType: parseMultiQueryValues(query.type),
        audience: parseMultiQueryValues(query.audience),
        status: parseMultiQueryValues(query.status),
        project: parseExactMultiQueryValues(query.project),
        budget: query.budget,
        limit: query.limit,
      });
      return c.json({
        results: result.results,
        budget: result.budget,
        truncated: result.truncated,
        skipped: result.skipped,
      });
    },
  );

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
        const body = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const documentId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "document",
            entityId: documentId,
            operation: "upsert",
            payload: buildDocumentRestPayload(documentId, body),
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(
              { error: "Document create failed", code: "internal" },
              500,
            );
          }
          publishDocumentLiveFromAgent(auth, row.id, {
            projectId: row.projectId,
            storageKey: row.storageKey,
          });
          return c.json(toDocument(row), 201);
        }
        const row = await documentService.createDocument(
          auth.workspaceId,
          body,
        );
        await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          storageKey: row.storageKey,
        });
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
        const documentId = c.req.param("id");
        const patch = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const existing = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!existing) {
            return c.json(notFound("Document"), 404);
          }
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "document",
            entityId: documentId,
            operation: "upsert",
            payload: buildDocumentRestPayload(documentId, patch),
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(notFound("Document"), 404);
          }
          publishDocumentLiveFromAgent(auth, row.id, {
            projectId: row.projectId,
            storageKey: row.storageKey,
          });
          return c.json(toDocument(row));
        }
        const row = await documentService.updateDocument(
          auth.workspaceId,
          documentId,
          patch,
        );
        if (!row) {
          return c.json(notFound("Document"), 404);
        }
        await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          storageKey: row.storageKey,
        });
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

    const documentId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await documentService.getDocumentById(
        auth.workspaceId,
        documentId,
      );
      if (!existing) {
        return c.json(notFound("Document"), 404);
      }
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "document",
        entityId: documentId,
        operation: "delete",
        payload: { id: documentId },
      });
      publishDocumentLiveFromAgent(auth, existing.id, {
        projectId: existing.projectId,
        operation: "delete",
        storageKey: existing.storageKey,
      });
      return c.body(null, 204);
    }

    const row = await documentService.deleteDocument(
      auth.workspaceId,
      documentId,
    );
    if (!row) {
      return c.json(notFound("Document"), 404);
    }

    await recordDocumentRestSyncEvent(auth.workspaceId, row, "delete");
    publishDocumentLiveFromAgent(auth, row.id, {
      projectId: row.projectId,
      operation: "delete",
      storageKey: row.storageKey,
    });
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
          publishDocumentLiveFromAgent(auth, documentId, {
            projectId: row.projectId,
            contentVersion: result.contentVersion,
            storageKey: row.storageKey,
          });
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
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          contentVersion: row.contentVersion,
          storageKey: row.storageKey,
        });

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
        if (error instanceof Error && error.message === "INVALID_YAML") {
          return c.json(
            {
              error: "Invalid YAML front matter",
              code: "invalid_yaml",
            },
            422,
          );
        }
        if (error instanceof Error && error.message === "INVALID_PROPERTY") {
          return c.json(
            {
              error: "Invalid document property value",
              code: "invalid_property",
            },
            422,
          );
        }
        throw error;
      }
    },
  );

  app.get("/api/v1/documents/:id/properties", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const result = await getDocumentProperties(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!result) {
      return c.json(notFound("Document"), 404);
    }
    return c.json(result);
  });

  app.put(
    "/api/v1/documents/:id/properties",
    zValidator("json", putDocumentPropertiesSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        const documentId = c.req.param("id");

        if (isRestLeaderFirstWrite()) {
          const leaderResult = await commitDocumentPropertiesLeaderFirst({
            workspaceId: auth.workspaceId,
            documentId,
            properties: body.properties,
            ifMatchVersion: body.ifMatchVersion,
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          publishDocumentLiveFromAgent(auth, documentId, {
            projectId: row?.projectId ?? null,
            contentVersion: leaderResult.contentVersion,
            storageKey: row?.storageKey,
          });
          return c.json({
            docKey: leaderResult.docKey,
            properties: leaderResult.properties,
            frontMatterValid: leaderResult.frontMatterValid,
            contentVersion: leaderResult.contentVersion,
          });
        }

        const result = await putDocumentProperties(
          auth.workspaceId,
          documentId,
          body,
        );
        if (!result) {
          return c.json(notFound("Document"), 404);
        }
        publishDocumentLiveFromAgent(auth, result.row.id, {
          projectId: result.row.projectId,
          contentVersion: result.contentVersion,
          storageKey: result.row.storageKey,
        });
        return c.json({
          docKey: result.row.docKey,
          properties: result.properties,
          frontMatterValid: result.row.frontMatterValid,
          contentVersion: result.contentVersion,
        });
      } catch (error) {
        if (error instanceof DocumentPropertyError) {
          if (error.code === "CONTENT_VERSION_CONFLICT") {
            return c.json(
              {
                error: "Document content version conflict",
                code: "content_version_conflict",
              },
              409,
            );
          }
          if (error.code === "INVALID_YAML") {
            return c.json(
              { error: "Invalid YAML front matter", code: "invalid_yaml" },
              422,
            );
          }
          if (error.code === "STORAGE_NOT_FOUND") {
            return c.json(
              {
                error: "Document content not found in storage",
                code: "storage_not_found",
              },
              422,
            );
          }
          return c.json(
            { error: error.message, code: "invalid_property" },
            422,
          );
        }
        if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
          return c.json(notFound("Document"), 404);
        }
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

  app.get("/api/v1/documents/:id/sections", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("documents:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const heading = c.req.query("heading");
    if (!heading?.trim()) {
      return c.json(
        { error: "Query parameter heading is required", code: "bad_request" },
        400,
      );
    }

    try {
      const result = await documentService.getDocumentSection(
        auth.workspaceId,
        c.req.param("id"),
        heading,
      );
      if (!result) {
        return c.json(notFound("Document"), 404);
      }
      return c.json({
        heading: result.heading,
        headingPath: result.headingPath,
        slug: result.slug,
        text: result.text,
        contentVersion: result.contentVersion,
      });
    } catch (error) {
      if (error instanceof documentService.DocumentSectionError) {
        if (error.code === "SECTION_NOT_FOUND") {
          return c.json(
            { error: error.message, code: "section_not_found" },
            404,
          );
        }
        return c.json(
          { error: error.message, code: "section_ambiguous" },
          409,
        );
      }
      if (error instanceof Error && error.message === "STORAGE_OBJECT_NOT_FOUND") {
        return c.json(
          { error: "Document content not found in storage", code: "storage_not_found" },
          404,
        );
      }
      throw error;
    }
  });

  // Section body = after heading → next same/higher heading (or EOF).
  // Nested subsections are included; PUT replaces/removes them with the body.
  app.put(
    "/api/v1/documents/:id/sections",
    zValidator("json", updateDocumentSectionSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("documents:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const body = c.req.valid("json");
        const documentId = c.req.param("id");

        if (isRestLeaderFirstWrite()) {
          const existing = await documentService.getDocumentContent(
            auth.workspaceId,
            documentId,
          );
          if (!existing) {
            return c.json(notFound("Document"), 404);
          }
          const nextContent = replaceDocumentSectionBody(
            existing.content,
            body.heading,
            body.body,
          ).content;
          const leaderResult = await commitDocumentContentLeaderFirst({
            workspaceId: auth.workspaceId,
            documentId,
            content: nextContent,
            ifMatchVersion: resolveSectionIfMatchVersion(
              body.ifMatchVersion,
              existing.row.contentVersion,
            ),
          });
          const row = await documentService.getDocumentById(
            auth.workspaceId,
            documentId,
          );
          if (!row) {
            return c.json(notFound("Document"), 404);
          }
          publishDocumentLiveFromAgent(auth, documentId, {
            projectId: row.projectId,
            contentVersion: leaderResult.contentVersion,
            storageKey: row.storageKey,
          });
          const { section, text } = readDocumentSection(
            nextContent,
            body.heading,
          );
          return c.json({
            heading: section.heading,
            headingPath: section.path,
            slug: section.slug,
            text,
            contentVersion: leaderResult.contentVersion,
          });
        }

        const result = await documentService.updateDocumentSection(
          auth.workspaceId,
          documentId,
          body,
        );
        if (!result) {
          return c.json(notFound("Document"), 404);
        }
        publishDocumentLiveFromAgent(auth, result.row.id, {
          projectId: result.row.projectId,
          contentVersion: result.row.contentVersion,
          storageKey: result.row.storageKey,
        });
        return c.json({
          heading: result.heading,
          headingPath: result.headingPath,
          slug: result.slug,
          text: result.text,
          contentVersion: result.row.contentVersion,
        });
      } catch (error) {
        if (error instanceof documentService.DocumentSectionError) {
          if (error.code === "SECTION_NOT_FOUND") {
            return c.json(
              { error: error.message, code: "section_not_found" },
              404,
            );
          }
          return c.json(
            { error: error.message, code: "section_ambiguous" },
            409,
          );
        }
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
        if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
          return c.json(notFound("Document"), 404);
        }
        if (error instanceof Error && error.message === "INVALID_YAML") {
          return c.json(
            { error: "Invalid YAML front matter", code: "invalid_yaml" },
            422,
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
    const patchParsed = updateTaskSchema.safeParse(body.patch);
    if (!ids.success || !patchParsed.success) {
      return c.json({ error: "Invalid batch update", code: "bad_request" }, 400);
    }

    const {
      activityActor: _activityActor,
      agentInboxApproved,
      comment: _comment,
      projectKey,
      ...patchFields
    } = patchParsed.data;
    // Inline comments are not supported on batch — use PATCH /tasks/:id.
    void _comment;
    void _activityActor;

    let resolvedPatch;
    try {
      const resolvedRefs = await resolveTaskWriteRefs(auth.workspaceId, {
        projectId: patchFields.projectId,
        projectKey,
        contactId: patchFields.contactId,
        assigneeId: patchFields.assigneeId,
        relatedContactIds: patchFields.relatedContactIds,
        relatedOrganizationIds: patchFields.relatedOrganizationIds,
        linkedEmailIds: patchFields.linkedEmailIds,
      });
      resolvedPatch = {
        ...patchFields,
        ...resolvedRefs,
        ...(agentInboxApproved !== undefined ? { agentInboxApproved } : {}),
      };
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
      if (
        error instanceof Error &&
        error.message === "RELATED_CONTACT_NOT_FOUND"
      ) {
        return c.json(
          {
            error: "Related contact not found",
            code: "related_contact_not_found",
          },
          400,
        );
      }
      if (
        error instanceof Error &&
        error.message === "RELATED_ORGANIZATION_NOT_FOUND"
      ) {
        return c.json(
          {
            error: "Related organization not found",
            code: "related_organization_not_found",
          },
          400,
        );
      }
      if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
        return c.json(notFound("Contact"), 404);
      }
      throw error;
    }

    const results: Array<
      | {
          ok: true;
          id: string;
          ref: string;
          task: Awaited<ReturnType<typeof taskWithKey>>;
        }
      | {
          ok: false;
          id: string | null;
          ref: string;
          error: string;
          code: "not_found";
        }
    > = [];
    const resolvedIds: string[] = [];
    const refById = new Map<string, string>();

    for (const ref of ids.data.ids) {
      const taskId = await routeTaskId(auth.workspaceId, ref);
      if (!taskId) {
        results.push({
          ok: false,
          id: null,
          ref,
          error: "Task not found",
          code: "not_found",
        });
        continue;
      }
      const existing = await taskProjectService.getTaskById(
        auth.workspaceId,
        taskId,
      );
      if (!existing) {
        results.push({
          ok: false,
          id: taskId,
          ref,
          error: "Task not found",
          code: "not_found",
        });
        continue;
      }
      resolvedIds.push(taskId);
      refById.set(taskId, ref);
    }

    const updatedRows = await (async () => {
      if (resolvedIds.length === 0) return [];
      if (isRestLeaderFirstWrite()) {
        // Use patch so unknown ids never invent rows (OS-64).
        await commitRestEntityWriteBatch({
          workspaceId: auth.workspaceId,
          changes: resolvedIds.map((id) => ({
            entity: "task" as const,
            entityId: id,
            operation: "patch" as const,
            payload: buildTaskRestPayload(id, resolvedPatch),
          })),
        });
        const loaded = await Promise.all(
          resolvedIds.map((id) =>
            taskProjectService.getTaskById(auth.workspaceId, id),
          ),
        );
        return loaded.filter(
          (row): row is NonNullable<typeof row> => row != null,
        );
      }
      return taskProjectService.batchUpdateTasks(
        auth.workspaceId,
        resolvedIds,
        resolvedPatch,
        writeActorFromAuth(auth),
      );
    })();

    if (!isRestLeaderFirstWrite()) {
      for (const row of updatedRows) {
        await recordTaskRestSyncEvent(auth.workspaceId, row, "upsert");
      }
    }
    for (const row of updatedRows) {
      publishTaskLive(auth, row.id, {
        projectId: row.projectId ?? null,
        operation: "upsert",
      });
    }

    const tasksOut = await tasksWithKeys(auth.workspaceId, updatedRows);
    const taskById = new Map(tasksOut.map((task) => [task.id, task]));
    for (const id of resolvedIds) {
      const task = taskById.get(id);
      const ref = refById.get(id) ?? id;
      if (task) {
        results.push({ ok: true, id, ref, task });
      } else {
        results.push({
          ok: false,
          id,
          ref,
          error: "Task not found",
          code: "not_found",
        });
      }
    }

    return c.json({ tasks: tasksOut, results });
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
      for (const row of rows) {
        publishTaskLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
      }
      return c.json({ tasks: await tasksWithKeys(auth.workspaceId, rows) });
    },
  );

  app.post("/api/v1/tasks/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
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
      if (row) {
        publishTaskLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
      }
      return c.json(await taskWithKey(auth.workspaceId, row!));
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
    publishTaskLive(auth, row.id, {
      projectId: row.projectId ?? null,
      operation: "upsert",
    });
    return c.json(await taskWithKey(auth.workspaceId, row));
  });

  app.post("/api/v1/tasks/:id/triage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const parsed = z
      .object({ projectId: z.string().nullable().optional(), status: z.string().optional() })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid triage data", code: "bad_request" }, 400);
    const taskIdRaw = c.req.param("id");
    const taskId = await routeTaskId(auth.workspaceId, taskIdRaw);
    if (!taskId) return c.json(notFound("Task"), 404);
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
      if (row) {
        publishTaskLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
      }
      return c.json(await taskWithKey(auth.workspaceId, row!));
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
    publishTaskLive(auth, row.id, {
      projectId: row.projectId ?? null,
      operation: "upsert",
    });
    return c.json(await taskWithKey(auth.workspaceId, row));
  });

  app.get("/api/v1/journal/:date", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:read")) return c.json(forbidden(), 403);
    const parsed = z.string().date().safeParse(c.req.param("date"));
    if (!parsed.success) return c.json({ error: "Invalid journal date", code: "bad_request" }, 400);
    let row = await documentService.getJournalDocument(auth.workspaceId, parsed.data);
    if (!row) {
      if (!can(auth, "documents:write")) return c.json(notFound("Journal entry"), 404);
      if (isRestLeaderFirstWrite()) {
        const documentId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "document",
          entityId: documentId,
          operation: "upsert",
          payload: buildDocumentRestPayload(documentId, {
            type: "journal",
            path: `${parsed.data}.md`,
            title: parsed.data,
            journalDate: parsed.data,
          }),
        });
        row = await documentService.getDocumentById(
          auth.workspaceId,
          documentId,
        );
        if (!row) {
          // Concurrent create may have won with another id — resolve by date.
          row = await documentService.getJournalDocument(
            auth.workspaceId,
            parsed.data,
          );
        }
      } else {
        row = await documentService.getOrCreateJournalDocument(
          auth.workspaceId,
          parsed.data,
        );
        await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
      }
      if (!row) {
        return c.json(
          { error: "Journal create failed", code: "internal" },
          500,
        );
      }
    }
    return c.json(toDocument(row));
  });

  app.get("/api/v1/habits", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const { habits, changedTasks, backfilledHabits } =
      await habitService.listHabits(auth.workspaceId);
    await emitHabitTaskSyncChanges(auth.workspaceId, changedTasks);
    await emitBackfilledHabitSync(auth.workspaceId, backfilledHabits);
    return c.json({ habits });
  });

  app.get("/api/v1/habits/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const result = await habitService.getHabitById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!result) return c.json(notFound("Habit"), 404);
    await emitHabitTaskSyncChanges(auth.workspaceId, result.changedTasks);
    await emitBackfilledHabitSync(auth.workspaceId, result.backfilledHabits);
    return c.json(result.habit);
  });

  app.post(
    "/api/v1/habits",
    zValidator("json", createHabitSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const habitId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "habit",
          entityId: habitId,
          operation: "upsert",
          payload: buildHabitRestPayload(habitId, body),
        });
        const result = await habitService.getHabitById(
          auth.workspaceId,
          habitId,
        );
        if (!result) {
          return c.json({ error: "Habit create failed", code: "internal" }, 500);
        }
        await emitHabitTaskSyncChanges(auth.workspaceId, result.changedTasks);
        nudgePeerEntityLive(auth, "habit", result.habit.id, "upsert");
        return c.json(result.habit, 201);
      }
      const created = await habitService.createHabit(
        auth.workspaceId,
        body,
      );
      const dbRow = await habitService.getHabitRow(auth.workspaceId, created.habit.id);
      if (dbRow) {
        await recordHabitRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      await emitHabitTaskSyncChanges(auth.workspaceId, created.changedTasks);
      nudgePeerEntityLive(auth, "habit", created.habit.id, "upsert");
      return c.json(created.habit, 201);
    },
  );

  app.patch(
    "/api/v1/habits/:id",
    zValidator("json", updateHabitSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      const habitId = c.req.param("id");
      const patch = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const existing = await habitService.getHabitById(
            auth.workspaceId,
            habitId,
          );
          if (!existing) return c.json(notFound("Habit"), 404);
          await emitHabitTaskSyncChanges(
            auth.workspaceId,
            existing.changedTasks,
          );
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "habit",
            entityId: habitId,
            operation: "upsert",
            payload: buildHabitRestPayload(habitId, patch),
          });
          const result = await habitService.getHabitById(
            auth.workspaceId,
            habitId,
          );
          if (!result) return c.json(notFound("Habit"), 404);
          await emitHabitTaskSyncChanges(
            auth.workspaceId,
            result.changedTasks,
          );
          nudgePeerEntityLive(auth, "habit", result.habit.id, "upsert");
          return c.json(result.habit);
        }
        const updated = await habitService.updateHabit(
          auth.workspaceId,
          habitId,
          patch,
        );
        if (!updated) return c.json(notFound("Habit"), 404);
        const dbRow = await habitService.getHabitRow(
          auth.workspaceId,
          updated.habit.id,
        );
        if (dbRow) {
          await recordHabitRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        await emitHabitTaskSyncChanges(auth.workspaceId, updated.changedTasks);
        nudgePeerEntityLive(auth, "habit", updated.habit.id, "upsert");
        return c.json(updated.habit);
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
        const habitId = c.req.param("id");
        const input = c.req.valid("json");

        if (isRestLeaderFirstWrite()) {
          const existing = await habitService.findHabitTaskForDueYmd(
            auth.workspaceId,
            habitId,
            input.dueYmd,
          );
          const taskId = existing?.id ?? newId();
          const payload = await habitService.buildHabitDayTaskSyncPayload(
            auth.workspaceId,
            habitId,
            input,
            taskId,
            existing,
          );
          if (!payload) return c.json(notFound("Habit"), 404);
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "task",
            entityId: taskId,
            operation: "upsert",
            payload,
          });
          const reconcileChanges =
            await habitService.planHabitDayReconcileLeaderChanges(
              auth.workspaceId,
              habitId,
              input,
            );
          if (reconcileChanges.length > 0) {
            await commitRestEntityWriteBatch({
              workspaceId: auth.workspaceId,
              changes: reconcileChanges.map((change) => ({
                entity: "task" as const,
                entityId: change.entityId,
                operation: change.operation,
                payload: change.payload,
              })),
            });
          }
          const task = await taskProjectService.getTaskById(
            auth.workspaceId,
            taskId,
          );
          if (!task) {
            return c.json(
              { error: "Habit day write failed", code: "internal" },
              500,
            );
          }
          return c.json(await taskWithKey(auth.workspaceId, task), existing ? 200 : 201);
        }

        const result = await habitService.recordHabitDay(
          auth.workspaceId,
          habitId,
          input,
        );
        if (!result) return c.json(notFound("Habit"), 404);
        await emitHabitTaskSyncChanges(auth.workspaceId, result.changedTasks);
        return c.json(await taskWithKey(auth.workspaceId, result.task), result.created ? 201 : 200);
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
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseMeetingsListQuery(raw);
      parsed = {
        ...parsed,
        projectId: await requireResolvedRef(
          auth.workspaceId,
          parsed.projectId,
          "projectId",
        ),
        organizationId: await requireResolvedRef(
          auth.workspaceId,
          parsed.organizationId,
          "organizationId",
        ),
        contactId: await requireResolvedRef(
          auth.workspaceId,
          parsed.contactId,
          "contactId",
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
        MEETINGS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      return c.json({
        meetings: await meetingService.listMeetings(auth.workspaceId, parsed),
      });
    }

    return c.json(
      await meetingService.listMeetingsPaginated(auth.workspaceId, parsed),
    );
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
          if (row) {
            publishMeetingLive(auth, row.id, {
              projectId: row.projectId ?? null,
              operation: "upsert",
            });
          }
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
          await recordMeetingDerivedCrmActivityRestSyncEvents(
            auth.workspaceId,
            dbRow.id,
          );
        }
        publishMeetingLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
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
          if (row) {
            publishMeetingLive(auth, row.id, {
              projectId: row.projectId ?? null,
              operation: "upsert",
            });
          }
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
          await recordMeetingDerivedCrmActivityRestSyncEvents(
            auth.workspaceId,
            dbRow.id,
          );
        }
        publishMeetingLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
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

  app.post("/api/v1/meetings/:id/send-invite", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const meetingId = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as {
      contactId?: string;
    } | null;
    const contactId = body?.contactId?.trim() ?? "";
    if (!contactId) {
      return c.json({ error: "contactId is required" }, 400);
    }
    const meeting = await meetingService.getMeetingById(
      auth.workspaceId,
      meetingId,
    );
    if (!meeting) return c.json(notFound("Meeting"), 404);
    if (meeting.format !== "video_call") {
      return c.json(
        {
          error: "Meeting emails are only supported for video calls",
          code: "meeting_not_video_call",
        },
        400,
      );
    }
    if (!meeting.attendeeContactIds.includes(contactId)) {
      return c.json(
        {
          error: "Contact is not an attendee on this meeting",
          code: "contact_not_attendee",
        },
        400,
      );
    }
    const { sendMeetingPortalEmailToAttendee } = await import(
      "../services/meeting-portal-emails.js"
    );
    const result = await sendMeetingPortalEmailToAttendee({
      workspaceId: auth.workspaceId,
      meetingId,
      contactId,
      kind: "invite",
    });
    if (!result.ok) {
      if (result.code === "not_found") {
        return c.json(notFound("Meeting"), 404);
      }
      return c.json(
        { error: result.error, code: result.code },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
      attendeePortalEmails: result.attendeePortalEmails,
    });
  });

  app.post("/api/v1/meetings/:id/send-reminder", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const meetingId = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as {
      contactId?: string;
    } | null;
    const contactId = body?.contactId?.trim() ?? "";
    if (!contactId) {
      return c.json({ error: "contactId is required" }, 400);
    }
    const meeting = await meetingService.getMeetingById(
      auth.workspaceId,
      meetingId,
    );
    if (!meeting) return c.json(notFound("Meeting"), 404);
    if (meeting.format !== "video_call") {
      return c.json(
        {
          error: "Meeting emails are only supported for video calls",
          code: "meeting_not_video_call",
        },
        400,
      );
    }
    if (!meeting.attendeeContactIds.includes(contactId)) {
      return c.json(
        {
          error: "Contact is not an attendee on this meeting",
          code: "contact_not_attendee",
        },
        400,
      );
    }
    const { sendMeetingPortalEmailToAttendee } = await import(
      "../services/meeting-portal-emails.js"
    );
    const result = await sendMeetingPortalEmailToAttendee({
      workspaceId: auth.workspaceId,
      meetingId,
      contactId,
      kind: "reminder",
    });
    if (!result.ok) {
      if (result.code === "not_found") {
        return c.json(notFound("Meeting"), 404);
      }
      return c.json(
        { error: result.error, code: result.code },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
      attendeePortalEmails: result.attendeePortalEmails,
    });
  });

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
      publishMeetingLive(auth, meetingId, {
        projectId: existing.projectId ?? null,
        operation: "delete",
      });
      return c.body(null, 204);
    }
    const dbRow = await meetingService.deleteMeetingRow(
      auth.workspaceId,
      meetingId,
    );
    if (!dbRow) return c.json(notFound("Meeting"), 404);
    await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "delete");
    await recordMeetingDerivedCrmActivityRestSyncEvents(
      auth.workspaceId,
      dbRow.id,
    );
    publishMeetingLive(auth, meetingId, {
      projectId: dbRow.projectId ?? null,
      operation: "delete",
    });
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
      const orderedIds = c.req.valid("json").orderedIds;
      const rows = await (async () => {
        if (isRestLeaderFirstWrite()) {
          await commitRestEntityWriteBatch({
            workspaceId: auth.workspaceId,
            changes: orderedIds.map((id, index) => ({
              entity: "document" as const,
              entityId: id,
              operation: "upsert" as const,
              payload: buildDocumentRestPayload(id, { sortOrder: index }),
            })),
          });
          const loaded = await Promise.all(
            orderedIds.map((id) =>
              documentService.getDocumentById(auth.workspaceId, id),
            ),
          );
          return loaded.filter(
            (row): row is NonNullable<typeof row> => row != null,
          );
        }
        return documentService.reorderDocuments(auth.workspaceId, orderedIds);
      })();
      if (!isRestLeaderFirstWrite()) {
        for (const row of rows) {
          await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
        }
      }
      for (const row of rows) {
        publishDocumentLiveFromAgent(auth, row.id, {
          projectId: row.projectId,
          storageKey: row.storageKey,
        });
      }
      return c.json({ documents: rows.map(toDocument) });
    },
  );

  app.post("/api/v1/documents/:id/move", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "documents:write")) return c.json(forbidden(), 403);
    const parsed = z.object({ parentId: z.string().nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid parentId", code: "bad_request" }, 400);
    const documentId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await documentService.getDocumentById(
        auth.workspaceId,
        documentId,
      );
      if (!existing) return c.json(notFound("Document"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "document",
        entityId: documentId,
        operation: "upsert",
        payload: buildDocumentRestPayload(documentId, {
          parentId: parsed.data.parentId,
        }),
      });
      const row = await documentService.getDocumentById(
        auth.workspaceId,
        documentId,
      );
      if (!row) return c.json(notFound("Document"), 404);
      publishDocumentLiveFromAgent(auth, row.id, {
        projectId: row.projectId,
        storageKey: row.storageKey,
      });
      return c.json(toDocument(row));
    }
    try {
      const row = await documentService.moveDocument(
        auth.workspaceId,
        documentId,
        parsed.data.parentId,
      );
      if (!row) return c.json(notFound("Document"), 404);
      await recordDocumentRestSyncEvent(auth.workspaceId, row, "upsert");
      publishDocumentLiveFromAgent(auth, row.id, {
        projectId: row.projectId,
        storageKey: row.storageKey,
      });
      return c.json(toDocument(row));
    } catch (error) {
      if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
        return c.json(notFound("Folder"), 404);
      }
      if (error instanceof Error && error.message === "INVALID_PARENT") {
        return c.json(
          { error: "Document cannot be its own parent", code: "bad_request" },
          400,
        );
      }
      throw error;
    }
  });

}
