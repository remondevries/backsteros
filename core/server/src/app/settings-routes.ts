/**
 * settings-routes routes (OS-73 split from routes.ts).
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
  updateAutoReviewWebhookSettingsSchema,
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
import * as autoReviewWebhookService from "../services/auto-review-webhook.js";
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

export function registerSettingsRoutes(app: Hono) {
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
    const patch = parsed.data;
    const touchesWorkspaceSettings =
      patch.spellcheckEnabled !== undefined ||
      patch.spellcheckModel !== undefined ||
      patch.spellcheckInstructions !== undefined ||
      patch.researchEnabled !== undefined ||
      patch.researchModel !== undefined ||
      patch.researchInstructions !== undefined;

    if (isRestLeaderFirstWrite()) {
      if (patch.apiKey !== undefined) {
        await cursorSettingsService.updateCursorApiKey(
          auth.workspaceId,
          patch.apiKey,
        );
      }
      if (touchesWorkspaceSettings) {
        const current = (await circleService.getSettings(
          auth.workspaceId,
        )) as Record<string, unknown>;
        const settingsPatch =
          cursorSettingsService.buildCursorWorkspaceSettingsPatch(
            current,
            patch,
          );
        if (settingsPatch) {
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "workspace_setting",
            entityId: auth.workspaceId,
            operation: "upsert",
            payload: buildWorkspaceSettingRestPayload(
              auth.workspaceId,
              settingsPatch,
            ),
          });
        }
      }
      return c.json(
        await cursorSettingsService.getCursorSettings(auth.workspaceId),
      );
    }

    const result = await cursorSettingsService.updateCursorSettings(
      auth.workspaceId,
      patch,
    );
    if (touchesWorkspaceSettings) {
      const settings = sanitizeWorkspaceSettings(
        (await circleService.getSettings(auth.workspaceId)) as Record<
          string,
          unknown
        >,
      );
      await recordWorkspaceSettingRestSyncEvent(auth.workspaceId, settings);
    }
    return c.json(result);
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
  app.get("/api/v1/settings/mapbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await mapboxSettingsService.getMapboxSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/mapbox", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateMapboxSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid Mapbox settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await mapboxSettingsService.updateMapboxSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/mapbox/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await mapboxSettingsService.testMapboxConnection(auth.workspaceId),
    );
  });
  app.get("/api/v1/settings/github", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await githubSettingsService.getGithubSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/github", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateGithubSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid GitHub settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await githubSettingsService.updateGithubSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/github/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await githubSettingsService.testGithubConnection(auth.workspaceId),
    );
  });
  app.get("/api/v1/settings/transip", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await transipSettingsService.getTransipSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/transip", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateTransipSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid TransIP settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await transipSettingsService.updateTransipSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/transip/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await transipSettingsService.testTransipConnection(auth.workspaceId),
    );
  });
  app.get("/api/v1/settings/cloudflare", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await cloudflareSettingsService.getCloudflareSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/cloudflare", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateCloudflareSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid Cloudflare settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await cloudflareSettingsService.updateCloudflareSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/cloudflare/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await cloudflareSettingsService.testCloudflareConnection(auth.workspaceId),
    );
  });
  app.get(
    "/api/v1/mapbox/geocode",
    zValidator("query", mapboxGeocodeQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read") && !can(auth, "contacts:write")) {
        return c.json(forbidden(), 403);
      }
      const { q, country } = c.req.valid("query");
      try {
        const result = await mapboxSettingsService.geocodeQuery(
          auth.workspaceId,
          q,
          { country },
        );
        return c.json({ result });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Mapbox geocode failed";
        const status =
          error instanceof MapboxApiError && error.status === 401 ? 400 : 400;
        return c.json({ error: message, code: "bad_request" }, status);
      }
    },
  );
  app.get(
    "/api/v1/mapbox/static-map",
    zValidator("query", mapboxStaticMapQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read") && !can(auth, "contacts:read")) {
        return c.json(forbidden(), 403);
      }
      const query = c.req.valid("query");
      try {
        const png = await mapboxSettingsService.fetchStaticMapPng(
          auth.workspaceId,
          {
            latitude: query.lat,
            longitude: query.lng,
            zoom: query.z,
            width: query.width,
            height: query.height,
          },
        );
        return new Response(png, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "cache-control": "private, max-age=3600",
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Mapbox static map failed";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
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
  app.get("/api/v1/settings/auto-review-webhook", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await autoReviewWebhookService.getAutoReviewWebhookSettings(
        auth.workspaceId,
      ),
    );
  });
  app.patch("/api/v1/settings/auto-review-webhook", async (c) => {
    const auth = getAuth(c);
    const contactIsWorkspaceOwner =
      auth.kind === "api_key" && Boolean(auth.contactId)
        ? await apiKeyService.apiKeyContactIsWorkspaceOwner(auth)
        : false;
    if (!canManageApiKeys(auth, { contactIsWorkspaceOwner })) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }
    const parsed = updateAutoReviewWebhookSettingsSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid auto-review webhook settings", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await autoReviewWebhookService.updateAutoReviewWebhookSettings(
          auth.workspaceId,
          parsed.data,
        ),
      );
    } catch (error) {
      if (error instanceof autoReviewWebhookService.AutoReviewWebhookSettingsError) {
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });
  app.post("/api/v1/settings/auto-review-webhook/test", async (c) => {
    const auth = getAuth(c);
    const contactIsWorkspaceOwner =
      auth.kind === "api_key" && Boolean(auth.contactId)
        ? await apiKeyService.apiKeyContactIsWorkspaceOwner(auth)
        : false;
    if (!canManageApiKeys(auth, { contactIsWorkspaceOwner })) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }
    return c.json(
      await autoReviewWebhookService.sendAutoReviewWebhookTest(
        auth.workspaceId,
      ),
    );
  });
}
