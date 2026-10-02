/**
 * letter-routes routes (OS-73 split from routes.ts).
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

export function registerLetterRoutes(app: Hono) {
  app.get("/api/v1/letters", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseLettersListQuery(raw);
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
        LETTERS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      return c.json({
        letters: await circleService.listLetters(auth.workspaceId, {
          projectId: parsed.projectId,
          organizationId: parsed.organizationId,
          contactId: parsed.contactId,
          status: parsed.status,
          triage: parsed.triage === true,
        }),
      });
    }

    return c.json(
      await circleService.listLettersPaginated(auth.workspaceId, parsed),
    );
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
      nudgePeerEntityLive(auth, "letter", row.id, "upsert");
      return c.json(row, 201);
    }
    const row = await circleService.createLetter(auth.workspaceId, body);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "letter", row.id, "upsert");
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
      if (row) nudgePeerEntityLive(auth, "letter", row.id, "upsert");
      return c.json(row);
    }
    const row = await circleService.updateLetter(auth.workspaceId, letterId, patch);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "letter", row.id, "upsert");
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
      nudgePeerEntityLive(auth, "letter", letterId, "delete");
      return c.body(null, 204);
    }
    const row = await circleService.deleteLetter(auth.workspaceId, letterId);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "delete");
    nudgePeerEntityLive(auth, "letter", row.id, "delete");
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
      if (row) nudgePeerEntityLive(auth, "letter", row.id, "upsert");
      return c.json(row);
    }
    const row = await circleService.triageLetter(auth.workspaceId, letterId, parsed.data);
    if (!row) return c.json(notFound("Letter"), 404);
    await recordLetterRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "letter", row.id, "upsert");
    return c.json(row);
  });
  app.put("/api/v1/letters/:id/pdf", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    if (blobReadsRequireLocalCore()) {
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
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Letter PDFs are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    try {
      const result = await circleService.getLetterPdf(auth.workspaceId, c.req.param("id"));
      if (!result) return c.json(notFound("PDF"), 404);
      c.header("Content-Type", result.row.contentType);
      c.header("Content-Disposition", `inline; filename="${(result.row.originalFilename || "letter.pdf").replaceAll('"', "")}"`);
      return c.body(Uint8Array.from(result.bytes).buffer);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        return c.json(notFound("PDF"), 404);
      }
      throw error;
    }
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
    if (blobReadsRequireLocalCore()) {
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
    if (!result) return c.json(notFound("Letter"), 404);
    await emitLetterMetadataSync(auth.workspaceId, c.req.param("id"));
    return c.json(result.attachment, 201);
  });
  app.post(
    "/api/v1/letters/:id/attachments/reorder",
    zValidator("json", reorderLetterAttachmentsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
      try {
        const letterId = c.req.param("id");
        const rows = await circleService.reorderLetterAttachments(
          auth.workspaceId,
          letterId,
          c.req.valid("json").orderedIds,
        );
        if (!rows) return c.json(notFound("Letter"), 404);
        await emitLetterMetadataSync(auth.workspaceId, letterId);
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
    if (blobReadsRequireLocalCore()) {
      return c.json(
        {
          error: "Letter PDFs are only available from local-core",
          code: "pdf_requires_local_core",
        },
        503,
      );
    }
    try {
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
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        return c.json(notFound("PDF"), 404);
      }
      throw error;
    }
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
    const letterId = c.req.param("id");
    const row = await circleService.updateLetterAttachment(
      auth.workspaceId,
      letterId,
      c.req.param("attachmentId"),
      parsed.data,
    );
    if (!row) return c.json(notFound("PDF"), 404);
    // Primary PDF rename may also retitle the letter + move the vault file.
    await emitLetterMetadataSync(auth.workspaceId, letterId);
    return c.json(row);
  });
  app.delete("/api/v1/letters/:id/attachments/:attachmentId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "letters:write")) return c.json(forbidden(), 403);
    const letterId = c.req.param("id");
    const row = await circleService.deleteLetterAttachment(
      auth.workspaceId,
      letterId,
      c.req.param("attachmentId"),
    );
    if (!row) return c.json(notFound("PDF"), 404);
    await emitLetterMetadataSync(auth.workspaceId, letterId);
    return c.json(row);
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
      const entityType = c.req.param("entityType");
      const entityId = c.req.param("entityId");
      const syncEntity = avatarEntityToSyncEntity(entityType);
      const leaderFirst = isRestLeaderFirstWrite() && syncEntity != null;
      const row = await circleService.putAvatar(
        auth.workspaceId,
        entityType,
        entityId,
        bytes,
        contentType,
        { updateEntityColumns: !leaderFirst },
      );
      if (leaderFirst && syncEntity) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: syncEntity,
          entityId,
          operation: "upsert",
          payload:
            syncEntity === "organization"
              ? buildOrganizationRestPayload(entityId, {
                  avatarStorageKey: row.storageKey,
                  avatarContentType: row.contentType,
                })
              : syncEntity === "contact"
                ? buildContactRestPayload(entityId, {
                    avatarStorageKey: row.storageKey,
                    avatarContentType: row.contentType,
                  })
                : buildBankAccountRestPayload(entityId, {
                    avatarStorageKey: row.storageKey,
                    avatarContentType: row.contentType,
                  }),
        });
      } else if (syncEntity === "organization") {
        const org = await circleService.getOrganizationById(
          auth.workspaceId,
          entityId,
        );
        if (org) {
          await recordOrganizationRestSyncEvent(auth.workspaceId, org, "upsert");
          nudgeOrganizationLive(auth, org.id, "upsert");
        }
      } else if (syncEntity === "contact") {
        const contact = await circleService.getContactById(
          auth.workspaceId,
          entityId,
        );
        if (contact) {
          await recordContactRestSyncEvent(auth.workspaceId, contact, "upsert");
          nudgeContactLive(auth, contact.id, "upsert");
        }
      } else if (syncEntity === "bank_account") {
        const account = await financeService.getBankAccountById(
          auth.workspaceId,
          entityId,
        );
        if (account) {
          await recordBankAccountRestSyncEvent(
            auth.workspaceId,
            account,
            "upsert",
          );
        }
      }
      return c.json(row);
    },
  );
  app.get(
    "/api/v1/avatars/:entityType/:entityId/signed-url",
    zValidator("query", avatarSignedUrlQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "avatars:read")) return c.json(forbidden(), 403);

      const entityType = c.req.param("entityType");
      const entityId = c.req.param("entityId");
      if (!isAvatarSignedEntityType(entityType)) {
        return c.json(
          { error: "Invalid avatar entity type", code: "bad_request" as const },
          400,
        );
      }

      const secret = getAvatarUrlSigningSecret();
      const origin = getPublicApiOrigin();
      if (!secret || !origin) {
        return c.json(
          {
            error:
              "Avatar signed URLs are not configured (AVATAR_URL_SIGNING_SECRET and PUBLIC_API_URL)",
            code: "service_unavailable" as const,
          },
          503,
        );
      }

      const existing = await circleService.getAvatar(
        auth.workspaceId,
        entityType,
        entityId,
      );
      if (!existing) return c.json(notFound("Avatar"), 404);

      const query = c.req.valid("query");
      const minted = buildAvatarSignedUrl({
        origin,
        workspaceId: auth.workspaceId,
        entityType,
        entityId,
        secret,
        ttlSeconds: query.ttlSeconds,
      });

      return c.json({
        url: minted.url,
        expiresAt: minted.expiresAt.toISOString(),
      });
    },
  );

  app.get(
    "/api/v1/public/avatars/:entityType/:entityId",
    zValidator("query", publicAvatarQuerySchema),
    async (c) => {
      const entityType = c.req.param("entityType");
      const entityId = c.req.param("entityId");
      if (!isAvatarSignedEntityType(entityType)) {
        return c.json(notFound("Avatar"), 404);
      }

      const secret = getAvatarUrlSigningSecret();
      if (!secret) {
        return c.json(notFound("Avatar"), 404);
      }

      const query = c.req.valid("query");
      const payload = {
        workspaceId: query.ws,
        entityType,
        entityId,
        exp: query.exp,
      };
      if (!verifyAvatarSignature(payload, query.sig, secret)) {
        return c.json(notFound("Avatar"), 404);
      }

      const result = await circleService.getAvatar(
        query.ws,
        entityType,
        entityId,
      );
      if (!result) return c.json(notFound("Avatar"), 404);

      const contentType = resolveAvatarContentType(
        result.row.contentType,
        result.bytes,
      );
      const remainingTtl = Math.max(0, query.exp - Math.floor(Date.now() / 1000));
      const cacheSeconds = Math.min(300, remainingTtl);
      c.header("Content-Type", contentType);
      c.header(
        "Cache-Control",
        cacheSeconds > 0
          ? `public, max-age=${cacheSeconds}`
          : "public, max-age=0, must-revalidate",
      );
      const body = Uint8Array.from(result.bytes);
      return c.body(
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
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
    const entityType = c.req.param("entityType");
    const entityId = c.req.param("entityId");
    const syncEntity = avatarEntityToSyncEntity(entityType);
    const leaderFirst = isRestLeaderFirstWrite() && syncEntity != null;
    const row = await circleService.deleteAvatar(
      auth.workspaceId,
      entityType,
      entityId,
      { updateEntityColumns: !leaderFirst },
    );
    if (!row) return c.json(notFound("Avatar"), 404);
    if (leaderFirst && syncEntity) {
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: syncEntity,
        entityId,
        operation: "upsert",
        payload:
          syncEntity === "organization"
            ? buildOrganizationRestPayload(entityId, {
                avatarStorageKey: null,
                avatarContentType: null,
              })
            : syncEntity === "contact"
              ? buildContactRestPayload(entityId, {
                  avatarStorageKey: null,
                  avatarContentType: null,
                })
              : buildBankAccountRestPayload(entityId, {
                  avatarStorageKey: null,
                  avatarContentType: null,
                }),
      });
    } else if (syncEntity === "organization") {
      const org = await circleService.getOrganizationById(
        auth.workspaceId,
        entityId,
      );
      if (org) {
        await recordOrganizationRestSyncEvent(auth.workspaceId, org, "upsert");
        nudgeOrganizationLive(auth, org.id, "upsert");
      }
    } else if (syncEntity === "contact") {
      const contact = await circleService.getContactById(
        auth.workspaceId,
        entityId,
      );
      if (contact) {
        await recordContactRestSyncEvent(auth.workspaceId, contact, "upsert");
        nudgeContactLive(auth, contact.id, "upsert");
      }
    } else if (syncEntity === "bank_account") {
      const account = await financeService.getBankAccountById(
        auth.workspaceId,
        entityId,
      );
      if (account) {
        await recordBankAccountRestSyncEvent(
          auth.workspaceId,
          account,
          "upsert",
        );
      }
    }
    return c.json(row);
  });

  app.put(
    "/api/v1/devices/push-token",
    zValidator("json", upsertDevicePushTokenSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!isOwnerShellAuth(auth)) {
        return c.json(unauthorized(), 401);
      }
      const body = c.req.valid("json");
      try {
        await pushInboxTriageService.upsertDevicePushToken({
          workspaceId: auth.workspaceId,
          userId: auth.userId!,
          platform: body.platform,
          token: body.token,
          deviceName: body.deviceName,
        });
        return c.json({ ok: true as const });
      } catch (error) {
        if (error instanceof Error && error.message === "PUSH_TOKEN_REQUIRED") {
          return c.json({ error: "Token required", code: "bad_request" }, 400);
        }
        throw error;
      }
    },
  );
  app.delete(
    "/api/v1/devices/push-token",
    zValidator("json", deleteDevicePushTokenSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!isOwnerShellAuth(auth)) {
        return c.json(unauthorized(), 401);
      }
      const body = c.req.valid("json");
      await pushInboxTriageService.deleteDevicePushToken({
        workspaceId: auth.workspaceId,
        userId: auth.userId!,
        token: body.token,
      });
      return c.json({ ok: true as const });
    },
  );

}
