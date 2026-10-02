/**
 * crm-routes routes (OS-73 split from routes.ts).
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

export function registerCrmRoutes(app: Hono) {
  app.get("/api/v1/organizations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseOrganizationsListQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      const ignored = ignoredLegacyListKeys(
        raw,
        ORGANIZATIONS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      return c.json({
        organizations: await circleService.listOrganizations(auth.workspaceId, {
          q: parsed.q,
        }),
      });
    }

    return c.json(
      await circleService.listOrganizationsPaginated(auth.workspaceId, parsed),
    );
  });
  app.get("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationId = await routeOrganizationId(auth.workspaceId, c.req.param("id"));
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const row = await circleService.getOrganizationById(auth.workspaceId, organizationId);
    return row ? c.json(row) : c.json(notFound("Organization"), 404);
  });
  app.get("/api/v1/organizations/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationId = await routeOrganizationId(auth.workspaceId, c.req.param("id"));
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const result = await circleService.getOrganizationRelations(auth.workspaceId, organizationId);
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
    nudgeOrganizationLive(auth, row.id, "upsert");
    return c.json(row, 201);
  });
  app.patch("/api/v1/organizations/:id", zValidator("json", organizationSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "upsert",
        payload: buildOrganizationRestPayload(
          organizationId,
          existing
            ? patch
            : { ...patch, name: patch.name ?? "Organization" },
        ),
      });
      const row = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      return row ? c.json(row) : c.json(notFound("Organization"), 404);
    }
    let row = await circleService.updateOrganization(
      auth.workspaceId,
      organizationId,
      patch,
    );
    if (!row) {
      try {
        row = await circleService.createOrganization(
          auth.workspaceId,
          {
            ...patch,
            name: patch.name ?? "Organization",
          } as Parameters<typeof circleService.createOrganization>[1],
          organizationId,
        );
      } catch {
        return c.json(notFound("Organization"), 404);
      }
    }
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgeOrganizationLive(auth, row.id, "upsert");
    return c.json(row);
  });
  app.delete("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
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
    nudgeOrganizationLive(auth, row.id, "delete");
    return c.body(null, 204);
  });

  app.post(
    "/api/v1/portal/auth/login",
    zValidator("json", portalAuthLoginSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      const row = await circleService.getContactForPortalLogin(
        auth.workspaceId,
        body.username,
      );
      if (!row?.portalPasswordHash) {
        return c.json(
          { error: "Invalid username or password", code: "unauthorized" },
          401,
        );
      }
      const ok = await verifyPortalPassword(body.password, row.portalPasswordHash);
      if (!ok) {
        return c.json(
          { error: "Invalid username or password", code: "unauthorized" },
          401,
        );
      }
      return c.json({
        contact: toPublicContact(row),
      });
    },
  );

  app.get("/api/v1/contacts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseContactsListQuery(raw);
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
        CONTACTS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      const rows = await circleService.listContacts(auth.workspaceId, {
        organizationId: parsed.organizationId,
        q: parsed.q,
      });
      return c.json({ contacts: rows.map(toPublicContact) });
    }

    const result = await circleService.listContactsPaginated(
      auth.workspaceId,
      parsed,
    );
    return c.json({
      items: result.items.map(toPublicContact),
      nextCursor: result.nextCursor,
    });
  });
  app.get("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactId = await routeContactId(auth.workspaceId, c.req.param("id"));
    if (!contactId) return c.json(notFound("Contact"), 404);
    const row = await circleService.getContactById(auth.workspaceId, contactId);
    return row ? c.json(toPublicContact(row)) : c.json(notFound("Contact"), 404);
  });
  app.get("/api/v1/contacts/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactId = await routeContactId(auth.workspaceId, c.req.param("id"));
    if (!contactId) return c.json(notFound("Contact"), 404);
    const result = await circleService.getContactRelations(auth.workspaceId, contactId);
    return result ? c.json(result) : c.json(notFound("Contact"), 404);
  });
  app.post("/api/v1/contacts", zValidator("json", contactSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const body = await prepareContactWriteBody(c.req.valid("json"));
    if (isRestLeaderFirstWrite()) {
      try {
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
        await crmGroupsService.inheritOrganizationGroupMemberships(
          auth.workspaceId,
          row.id,
        );
        nudgeContactLive(auth, row.id, "upsert");
        return c.json(toPublicContact(row), 201);
      } catch (error) {
        if (error instanceof PortalUsernameConflictError) {
          return c.json(
            { error: error.message, code: error.code },
            409,
          );
        }
        throw error;
      }
    }
    try {
      const row = await circleService.createContact(auth.workspaceId, body);
      await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
      nudgeContactLive(auth, row.id, "upsert");
      for (const member of await crmGroupsService.inheritOrganizationGroupMemberships(
        auth.workspaceId,
        row.id,
      )) {
        const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
        if (dbRow) {
          await recordCrmGroupMemberRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmGroupMemberLive(auth, dbRow.id, "upsert");
        }
      }
      return c.json(toPublicContact(row), 201);
    } catch (error) {
      if (error instanceof PortalUsernameConflictError) {
        return c.json(
          { error: error.message, code: error.code },
          409,
        );
      }
      throw error;
    }
  });
  app.patch("/api/v1/contacts/:id", zValidator("json", contactSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const raw = c.req.valid("json") as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(raw, "portalPassword")) {
      console.info(
        `[portal-password] PATCH contact=${contactId} includesPassword=${raw.portalPassword !== undefined && raw.portalPassword !== null} clear=${raw.portalPassword === "" || raw.portalPassword === null}`,
      );
    }
    const patch = await prepareContactWriteBody(raw);
    if (isRestLeaderFirstWrite()) {
      try {
        const existing = await circleService.getContactById(auth.workspaceId, contactId);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "contact",
          entityId: contactId,
          operation: "upsert",
          payload: buildContactRestPayload(
            contactId,
            existing ? patch : { ...patch, firstName: patch.firstName ?? patch.name ?? "Contact" },
          ),
        });
        const row = await circleService.getContactById(auth.workspaceId, contactId);
        if (row && patch.organizationId !== undefined) {
          await crmGroupsService.inheritOrganizationGroupMemberships(
            auth.workspaceId,
            row.id,
          );
        }
        if (row) nudgeContactLive(auth, row.id, "upsert");
        return row ? c.json(toPublicContact(row)) : c.json(notFound("Contact"), 404);
      } catch (error) {
        if (error instanceof PortalUsernameConflictError) {
          return c.json(
            { error: error.message, code: error.code },
            409,
          );
        }
        throw error;
      }
    }
    let row: Awaited<ReturnType<typeof circleService.updateContact>>;
    try {
      row = await circleService.updateContact(auth.workspaceId, contactId, patch);
      if (!row) {
        // Heal local-only PowerSync contacts that never uploaded: create with the
        // client id so membership / relationship writes can proceed.
        try {
          row = await circleService.createContact(
            auth.workspaceId,
            {
              ...patch,
              firstName:
                patch.firstName ??
                (typeof patch.name === "string" ? patch.name : null) ??
                "Contact",
            } as Parameters<typeof circleService.createContact>[1],
            contactId,
          );
        } catch (error) {
          if (error instanceof PortalUsernameConflictError) throw error;
          return c.json(notFound("Contact"), 404);
        }
      }
    } catch (error) {
      if (error instanceof PortalUsernameConflictError) {
        return c.json(
          { error: error.message, code: error.code },
          409,
        );
      }
      throw error;
    }
    await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgeContactLive(auth, row.id, "upsert");
    if (patch.organizationId !== undefined) {
      for (const member of await crmGroupsService.inheritOrganizationGroupMemberships(
        auth.workspaceId,
        row.id,
      )) {
        const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
        if (dbRow) {
          await recordCrmGroupMemberRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmGroupMemberLive(auth, dbRow.id, "upsert");
        }
      }
    }
    return c.json(toPublicContact(row));
  });
  app.post("/api/v1/contacts/:id/send-portal-password-reset", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const row = await circleService.getContactById(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    const { sendPortalPasswordResetViaPortal } = await import(
      "../lib/portal-password-reset-proxy.js"
    );
    const result = await sendPortalPasswordResetViaPortal(contactId);
    if (!result.ok) {
      return c.json(
        { error: result.error, code: "portal_password_reset_failed" },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
    });
  });
  app.post("/api/v1/contacts/:id/send-portal-invite", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const row = await circleService.getContactById(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    const { sendPortalInviteViaPortal } = await import(
      "../lib/portal-password-reset-proxy.js"
    );
    const result = await sendPortalInviteViaPortal(contactId);
    if (!result.ok) {
      return c.json(
        { error: result.error, code: "portal_invite_failed" },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
    });
  });
  app.delete("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
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
      nudgeContactLive(auth, contactId, "delete");
      return c.body(null, 204);
    }
    const row = await circleService.deleteContact(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    await recordContactRestSyncEvent(auth.workspaceId, row, "delete");
    nudgeContactLive(auth, row.id, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/contacts/:id/relationships", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const result = await crmGroupsService.listContactRelationships(
      auth.workspaceId,
      contactId,
    );
    return result
      ? c.json({ relationships: result })
      : c.json(notFound("Contact"), 404);
  });
  app.post(
    "/api/v1/contacts/:id/relationships",
    zValidator("json", contactRelationshipInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const fromContactIdRaw = c.req.param("id");
      const fromContactId = await routeContactId(auth.workspaceId, fromContactIdRaw);
      if (!fromContactId) return c.json(notFound("Contact"), 404);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const relationshipId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "contact_relationship",
            entityId: relationshipId,
            operation: "upsert",
            payload: buildContactRelationshipRestPayload(
              relationshipId,
              fromContactId,
              body,
            ),
          });
          const row = await crmGroupsService.getContactRelationshipById(
            auth.workspaceId,
            relationshipId,
          );
          if (!row) {
            return c.json(
              { error: "Relationship create failed", code: "internal" },
              500,
            );
          }
          return c.json(row, 201);
        }
        const row = await crmGroupsService.createContactRelationship(
          auth.workspaceId,
          fromContactId,
          body,
        );
        const dbRow = await loadContactRelationshipRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordContactRelationshipRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeContactRelationshipLive(auth, dbRow.id, "upsert");
        }
        return c.json(row, 201);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        if (error.message === "RELATED_CONTACT_NOT_FOUND") {
          return c.json(notFound("Related contact"), 404);
        }
        if (
          error.message === "SELF_RELATIONSHIP" ||
          error.message === "RELATIONSHIP_EXISTS"
        ) {
          return c.json(
            {
              error: {
                code: error.message,
                message:
                  error.message === "SELF_RELATIONSHIP"
                    ? "A contact cannot relate to itself."
                    : "Relationship already exists.",
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
    "/api/v1/contact-relationships/:id",
    zValidator("json", updateContactRelationshipSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const relationshipId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await crmGroupsService.getContactRelationshipById(
          auth.workspaceId,
          relationshipId,
        );
        if (!existing) return c.json(notFound("Relationship"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "contact_relationship",
          entityId: relationshipId,
          operation: "upsert",
          payload: buildContactRelationshipRestPayload(
            relationshipId,
            existing.fromContactId,
            patch,
          ),
        });
        const row = await crmGroupsService.getContactRelationshipById(
          auth.workspaceId,
          relationshipId,
        );
        return row ? c.json(row) : c.json(notFound("Relationship"), 404);
      }
      const row = await crmGroupsService.updateContactRelationship(
        auth.workspaceId,
        relationshipId,
        patch,
      );
      if (!row) return c.json(notFound("Relationship"), 404);
      const dbRow = await loadContactRelationshipRow(
        auth.workspaceId,
        relationshipId,
      );
      if (dbRow) {
        await recordContactRelationshipRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "upsert",
        );
        nudgeContactRelationshipLive(auth, dbRow.id, "upsert");
      }
      return c.json(row);
    },
  );
  app.delete("/api/v1/contact-relationships/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const relationshipId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await crmGroupsService.getContactRelationshipById(
        auth.workspaceId,
        relationshipId,
      );
      if (!existing) return c.json(notFound("Relationship"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "contact_relationship",
        entityId: relationshipId,
        operation: "delete",
        payload: { id: relationshipId },
      });
      return c.body(null, 204);
    }
    const ok = await crmGroupsService.deleteContactRelationship(
      auth.workspaceId,
      relationshipId,
    );
    if (!ok) return c.json(notFound("Relationship"), 404);
    const dbRow = await loadContactRelationshipRow(
      auth.workspaceId,
      relationshipId,
    );
    if (dbRow) {
      await recordContactRelationshipRestSyncEvent(
        auth.workspaceId,
        dbRow,
        "delete",
      );
      nudgeContactRelationshipLive(auth, dbRow.id, "delete");
    }
    return c.body(null, 204);
  });

  app.get("/api/v1/crm-relationship-labels", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    return c.json({
      labels: await crmRelationshipLabelsService.listCrmRelationshipLabels(
        auth.workspaceId,
      ),
    });
  });

  app.post(
    "/api/v1/crm-relationship-labels",
    zValidator("json", crmRelationshipLabelInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const labelId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_relationship_label",
            entityId: labelId,
            operation: "upsert",
            payload: buildCrmRelationshipLabelRestPayload(labelId, body),
          });
          const row =
            await crmRelationshipLabelsService.getCrmRelationshipLabelById(
              auth.workspaceId,
              labelId,
            );
          if (!row) {
            return c.json(
              { error: "Label create failed", code: "internal" },
              500,
            );
          }
          return c.json(row, 201);
        }
        const row =
          await crmRelationshipLabelsService.createCrmRelationshipLabel(
            auth.workspaceId,
            body,
          );
        const dbRow = await loadCrmRelationshipLabelRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordCrmRelationshipLabelRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmRelationshipLabelLive(auth, dbRow.id, "upsert");
        }
        return c.json(row, 201);
      } catch (err) {
        if (err instanceof Error && err.message === "LABEL_SLUG_CONFLICT") {
          return c.json({ error: "Label slug already exists" }, 409);
        }
        if (err instanceof Error && err.message === "INVALID_LABEL") {
          return c.json({ error: "Invalid label" }, 400);
        }
        throw err;
      }
    },
  );

  app.patch(
    "/api/v1/crm-relationship-labels/:id",
    zValidator("json", updateCrmRelationshipLabelSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const labelId = c.req.param("id");
      const patch = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const existing =
            await crmRelationshipLabelsService.getCrmRelationshipLabelById(
              auth.workspaceId,
              labelId,
            );
          if (!existing) return c.json(notFound("Relationship label"), 404);
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_relationship_label",
            entityId: labelId,
            operation: "upsert",
            payload: buildCrmRelationshipLabelRestPayload(labelId, patch),
          });
          const row =
            await crmRelationshipLabelsService.getCrmRelationshipLabelById(
              auth.workspaceId,
              labelId,
            );
          return row ? c.json(row) : c.json(notFound("Relationship label"), 404);
        }
        const row =
          await crmRelationshipLabelsService.updateCrmRelationshipLabel(
            auth.workspaceId,
            labelId,
            patch,
          );
        if (!row) return c.json(notFound("Relationship label"), 404);
        const dbRow = await loadCrmRelationshipLabelRow(auth.workspaceId, labelId);
        if (dbRow) {
          await recordCrmRelationshipLabelRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmRelationshipLabelLive(auth, dbRow.id, "upsert");
        }
        return c.json(row);
      } catch (err) {
        if (err instanceof Error && err.message === "LABEL_SLUG_CONFLICT") {
          return c.json({ error: "Label slug already exists" }, 409);
        }
        if (err instanceof Error && err.message === "INVALID_LABEL") {
          return c.json({ error: "Invalid label" }, 400);
        }
        throw err;
      }
    },
  );

  app.delete("/api/v1/crm-relationship-labels/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const labelId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing =
        await crmRelationshipLabelsService.getCrmRelationshipLabelById(
          auth.workspaceId,
          labelId,
        );
      if (!existing) return c.json(notFound("Relationship label"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "crm_relationship_label",
        entityId: labelId,
        operation: "delete",
        payload: { id: labelId },
      });
      return c.body(null, 204);
    }
    const ok = await crmRelationshipLabelsService.deleteCrmRelationshipLabel(
      auth.workspaceId,
      labelId,
    );
    if (!ok) return c.json(notFound("Relationship label"), 404);
    const dbRow = await loadCrmRelationshipLabelRow(auth.workspaceId, labelId);
    if (dbRow) {
      await recordCrmRelationshipLabelRestSyncEvent(
        auth.workspaceId,
        dbRow,
        "delete",
      );
      nudgeCrmRelationshipLabelLive(auth, dbRow.id, "delete");
    }
    return c.body(null, 204);
  });

  app.get("/api/v1/crm-groups", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    return c.json({
      groups: await crmGroupsService.listCrmGroups(auth.workspaceId),
    });
  });
  app.get("/api/v1/crm-groups/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    const row = await crmGroupsService.getCrmGroupById(
      auth.workspaceId,
      c.req.param("id"),
    );
    return row ? c.json(row) : c.json(notFound("Group"), 404);
  });
  app.post(
    "/api/v1/crm-groups",
    zValidator("json", crmGroupInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
        return c.json(forbidden(), 403);
      }
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const groupId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "crm_group",
          entityId: groupId,
          operation: "upsert",
          payload: buildCrmGroupRestPayload(groupId, body),
        });
        const row = await crmGroupsService.getCrmGroupById(
          auth.workspaceId,
          groupId,
        );
        if (!row) {
          return c.json({ error: "Group create failed", code: "internal" }, 500);
        }
        return c.json(row, 201);
      }
      const row = await crmGroupsService.createCrmGroup(auth.workspaceId, body);
      const dbRow = await loadCrmGroupRow(auth.workspaceId, row.id);
      if (dbRow) {
        await recordCrmGroupRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      nudgeCrmGroupLive(auth, row.id, "upsert");
      return c.json(row, 201);
    },
  );
  app.patch(
    "/api/v1/crm-groups/:id",
    zValidator("json", updateCrmGroupSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
        return c.json(forbidden(), 403);
      }
      const groupId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await crmGroupsService.getCrmGroupById(
          auth.workspaceId,
          groupId,
        );
        if (!existing) return c.json(notFound("Group"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "crm_group",
          entityId: groupId,
          operation: "upsert",
          payload: buildCrmGroupRestPayload(groupId, patch),
        });
        const row = await crmGroupsService.getCrmGroupById(
          auth.workspaceId,
          groupId,
        );
        return row ? c.json(row) : c.json(notFound("Group"), 404);
      }
      const row = await crmGroupsService.updateCrmGroup(
        auth.workspaceId,
        groupId,
        patch,
      );
      if (!row) return c.json(notFound("Group"), 404);
      const dbRow = await loadCrmGroupRow(auth.workspaceId, groupId);
      if (dbRow) {
        await recordCrmGroupRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      nudgeCrmGroupLive(auth, groupId, "upsert");
      return c.json(row);
    },
  );
  app.delete("/api/v1/crm-groups/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
      return c.json(forbidden(), 403);
    }
    const groupId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await crmGroupsService.getCrmGroupById(
        auth.workspaceId,
        groupId,
      );
      if (!existing) return c.json(notFound("Group"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "crm_group",
        entityId: groupId,
        operation: "delete",
        payload: { id: groupId },
      });
      return c.body(null, 204);
    }
    const ok = await crmGroupsService.deleteCrmGroup(auth.workspaceId, groupId);
    if (!ok) return c.json(notFound("Group"), 404);
    const dbRow = await loadCrmGroupRow(auth.workspaceId, groupId);
    if (dbRow) {
      await recordCrmGroupRestSyncEvent(auth.workspaceId, dbRow, "delete");
    }
    nudgeCrmGroupLive(auth, groupId, "delete");
    return c.body(null, 204);
  });
  app.get("/api/v1/crm-groups/:id/members", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    const members = await crmGroupsService.listCrmGroupMembers(
      auth.workspaceId,
      c.req.param("id"),
    );
    return members
      ? c.json({ members })
      : c.json(notFound("Group"), 404);
  });
  app.post(
    "/api/v1/crm-groups/:id/members",
    zValidator("json", crmGroupMemberInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
        return c.json(forbidden(), 403);
      }
      const groupId = c.req.param("id");
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          if (!(await crmGroupsService.getCrmGroupById(auth.workspaceId, groupId))) {
            return c.json(notFound("Group"), 404);
          }

          const planned = await crmGroupsService.planCrmGroupMembershipCascade(
            auth.workspaceId,
            body,
          );
          let primary: Awaited<
            ReturnType<typeof crmGroupsService.getCrmGroupMemberById>
          > = null;

          for (const subject of planned) {
            const isPrimary =
              subject.subjectType === body.subjectType &&
              subject.subjectId === body.subjectId;

            // Skip cascade targets that are not on this core yet; fail only if
            // the subject the user actually selected is missing.
            if (subject.subjectType === "contact") {
              const contact = await circleService.getContactById(
                auth.workspaceId,
                subject.subjectId,
              );
              if (!contact) {
                if (isPrimary) {
                  return c.json(notFound("Member subject"), 404);
                }
                continue;
              }
            } else {
              const organization = await circleService.getOrganizationById(
                auth.workspaceId,
                subject.subjectId,
              );
              if (!organization) {
                if (isPrimary) {
                  return c.json(notFound("Member subject"), 404);
                }
                continue;
              }
            }

            const currentMembers = await crmGroupsService.listCrmGroupMembers(
              auth.workspaceId,
              groupId,
            );
            const already = currentMembers?.find(
              (member) =>
                member.subjectType === subject.subjectType &&
                member.subjectId === subject.subjectId,
            );
            if (already) {
              if (isPrimary) primary = already;
              continue;
            }

            const memberId = newId();
            await commitRestEntityWrite({
              workspaceId: auth.workspaceId,
              entity: "crm_group_member",
              entityId: memberId,
              operation: "upsert",
              payload: buildCrmGroupMemberRestPayload(memberId, groupId, subject),
            });
            const row =
              (await crmGroupsService.getCrmGroupMemberById(
                auth.workspaceId,
                memberId,
              )) ??
              (
                await crmGroupsService.listCrmGroupMembers(
                  auth.workspaceId,
                  groupId,
                )
              )?.find(
                (member) =>
                  member.subjectType === subject.subjectType &&
                  member.subjectId === subject.subjectId,
              ) ??
              null;
            if (!row) {
              return c.json(
                { error: "Group member create failed", code: "internal" },
                500,
              );
            }
            if (isPrimary) primary = row;
          }

          if (!primary) {
            return c.json(
              { error: "Group member create failed", code: "internal" },
              500,
            );
          }
          return c.json(primary, 201);
        }

        const result = await crmGroupsService.addCrmGroupMemberWithCascade(
          auth.workspaceId,
          groupId,
          body,
        );
        for (const member of result.members) {
          const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
          if (dbRow) {
            await recordCrmGroupMemberRestSyncEvent(
              auth.workspaceId,
              dbRow,
              "upsert",
            );
            nudgeCrmGroupMemberLive(auth, dbRow.id, "upsert");
          }
        }
        return c.json(result.primary, 201);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === "GROUP_NOT_FOUND") {
          return c.json(notFound("Group"), 404);
        }
        if (error.message === "SUBJECT_NOT_FOUND") {
          return c.json(notFound("Member subject"), 404);
        }
        throw error;
      }
    },
  );
  app.delete("/api/v1/crm-groups/:groupId/members/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
      return c.json(forbidden(), 403);
    }
    const groupId = c.req.param("groupId");
    const memberId = c.req.param("id");
    const existing = await crmGroupsService.getCrmGroupMemberById(
      auth.workspaceId,
      memberId,
    );
    if (!existing || existing.groupId !== groupId) {
      return c.json(notFound("Member"), 404);
    }

    if (isRestLeaderFirstWrite()) {
      const removeTargets = [existing];
      if (existing.subjectType === "organization") {
        const members = await crmGroupsService.listCrmGroupMembers(
          auth.workspaceId,
          groupId,
        );
        const planned = await crmGroupsService.planCrmGroupMembershipCascade(
          auth.workspaceId,
          {
            subjectType: "organization",
            subjectId: existing.subjectId,
          },
        );
        const contactIds = new Set(
          planned
            .filter((entry) => entry.subjectType === "contact")
            .map((entry) => entry.subjectId),
        );
        for (const member of members ?? []) {
          if (
            member.subjectType === "contact" &&
            contactIds.has(member.subjectId) &&
            member.id !== existing.id
          ) {
            removeTargets.push(member);
          }
        }
      } else if (existing.subjectType === "contact") {
        // Mirror service cascade: clearing a contact label also clears the org
        // (and sibling contacts) so the label cannot reappear via inheritance.
        const planned = await crmGroupsService.planCrmGroupMembershipCascade(
          auth.workspaceId,
          {
            subjectType: "contact",
            subjectId: existing.subjectId,
          },
        );
        const orgId = planned.find(
          (entry) => entry.subjectType === "organization",
        )?.subjectId;
        if (orgId) {
          const members = await crmGroupsService.listCrmGroupMembers(
            auth.workspaceId,
            groupId,
          );
          const orgMember = members?.find(
            (member) =>
              member.subjectType === "organization" &&
              member.subjectId === orgId,
          );
          if (orgMember) {
            removeTargets.length = 0;
            removeTargets.push(orgMember);
            const contactIds = new Set(
              planned
                .filter((entry) => entry.subjectType === "contact")
                .map((entry) => entry.subjectId),
            );
            for (const member of members ?? []) {
              if (
                member.subjectType === "contact" &&
                contactIds.has(member.subjectId)
              ) {
                removeTargets.push(member);
              }
            }
          }
        }
      }

      for (const target of removeTargets) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "crm_group_member",
          entityId: target.id,
          operation: "delete",
          payload: { id: target.id, group_id: groupId },
        });
      }
      return c.body(null, 204);
    }

    const result = await crmGroupsService.removeCrmGroupMemberWithCascade(
      auth.workspaceId,
      groupId,
      memberId,
    );
    if (result.removed.length === 0) return c.json(notFound("Member"), 404);
    for (const member of result.removed) {
      const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
      if (dbRow) {
        await recordCrmGroupMemberRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "delete",
        );
        nudgeCrmGroupMemberLive(auth, dbRow.id, "delete");
      }
    }
    return c.body(null, 204);
  });
  app.get("/api/v1/contacts/:id/groups", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const groups = await crmGroupsService.listCrmGroupsForSubject(
      auth.workspaceId,
      "contact",
      contactId,
    );
    // Local-first: contact may not be in Postgres yet — empty membership is fine.
    return c.json({ groups: groups ?? [] });
  });
  app.get("/api/v1/organizations/:id/groups", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const groups = await crmGroupsService.listCrmGroupsForSubject(
      auth.workspaceId,
      "organization",
      organizationId,
    );
    return c.json({ groups: groups ?? [] });
  });

  app.get("/api/v1/contacts/:id/activity", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const contact = await circleService.getContactById(
      auth.workspaceId,
      contactId,
    );
    if (!contact) return c.json(notFound("Contact"), 404);
    const query = crmActivityFeedQuerySchema.parse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });
    const feed = await crmActivitiesService.listCrmActivityFeed(
      auth.workspaceId,
      { subjectType: "contact", subjectId: contact.id },
      query,
    );
    return c.json(feed);
  });
  app.get("/api/v1/contacts/:id/portal-logs", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const contact = await circleService.getContactById(auth.workspaceId, contactId);
    if (!contact) return c.json(notFound("Contact"), 404);
    const rawLimit = c.req.query("limit");
    const parsedLimit =
      rawLimit != null ? Number.parseInt(String(rawLimit), 10) : undefined;
    const logs = await portalContactLogsService.listPortalContactLogs(
      auth.workspaceId,
      contactId,
      {
        limit:
          parsedLimit != null && Number.isFinite(parsedLimit)
            ? parsedLimit
            : undefined,
      },
    );
    return c.json({ logs });
  });
  app.post(
    "/api/v1/contacts/:id/portal-logs",
    zValidator("json", createPortalContactLogSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const contactIdRaw = c.req.param("id");
      const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
      if (!contactId) return c.json(notFound("Contact"), 404);
      const contact = await circleService.getContactById(
        auth.workspaceId,
        contactId,
      );
      if (!contact) return c.json(notFound("Contact"), 404);
      if (!contact.portalUsername?.trim()) {
        return c.json(
          {
            error: "Contact has no portal account",
            code: "portal_account_missing",
          },
          400,
        );
      }
      const body = c.req.valid("json");
      if (body.kind === "project_view" && !body.projectId?.trim()) {
        return c.json(
          { error: "projectId is required for project_view", code: "invalid" },
          400,
        );
      }
      const log = await portalContactLogsService.appendPortalContactLog(
        auth.workspaceId,
        contactId,
        body,
      );
      return c.json(log, 201);
    },
  );
  app.post(
    "/api/v1/contacts/:id/activity",
    zValidator("json", createCrmActivityNoteSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const contactIdRaw = c.req.param("id");
      const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
      if (!contactId) return c.json(notFound("Contact"), 404);
      const contact = await circleService.getContactById(
        auth.workspaceId,
        contactId,
      );
      if (!contact) return c.json(notFound("Contact"), 404);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const activityId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_activity",
            entityId: activityId,
            operation: "upsert",
            payload: buildCrmActivityRestPayload(
              activityId,
              "contact",
              contact.id,
              body,
              auth.userId ?? null,
            ),
          });
          const row = await crmActivitiesService.getCrmActivityById(
            auth.workspaceId,
            activityId,
          );
          if (!row) {
            return c.json(
              { error: "Activity create failed", code: "internal" },
              500,
            );
          }
          nudgeCrmActivityLive(auth, row.id, "upsert");
          return c.json(row, 201);
        }
        const row = await crmActivitiesService.createCrmActivityNote(
          auth.workspaceId,
          { subjectType: "contact", subjectId: contact.id },
          body,
          auth.userId ?? null,
        );
        const dbRow = await loadCrmActivityRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordCrmActivityRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        nudgeCrmActivityLive(auth, row.id, "upsert");
        return c.json(row, 201);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "INVALID_NOTE_BODY" ||
            error.message === "INVALID_OCCURRED_AT")
        ) {
          return c.json(
            {
              error: {
                code: error.message,
                message: "Invalid note activity payload.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );
  app.get("/api/v1/organizations/:id/activity", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const organization = await circleService.getOrganizationById(
      auth.workspaceId,
      organizationId,
    );
    if (!organization) return c.json(notFound("Organization"), 404);
    const query = crmActivityFeedQuerySchema.parse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });
    const feed = await crmActivitiesService.listCrmActivityFeed(
      auth.workspaceId,
      { subjectType: "organization", subjectId: organization.id },
      query,
    );
    return c.json(feed);
  });
  app.post(
    "/api/v1/organizations/:id/activity",
    zValidator("json", createCrmActivityNoteSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
      const organizationIdRaw = c.req.param("id");
      const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
      if (!organizationId) return c.json(notFound("Organization"), 404);
      const organization = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!organization) return c.json(notFound("Organization"), 404);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const activityId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_activity",
            entityId: activityId,
            operation: "upsert",
            payload: buildCrmActivityRestPayload(
              activityId,
              "organization",
              organization.id,
              body,
              auth.userId ?? null,
            ),
          });
          const row = await crmActivitiesService.getCrmActivityById(
            auth.workspaceId,
            activityId,
          );
          if (!row) {
            return c.json(
              { error: "Activity create failed", code: "internal" },
              500,
            );
          }
          nudgeCrmActivityLive(auth, row.id, "upsert");
          return c.json(row, 201);
        }
        const row = await crmActivitiesService.createCrmActivityNote(
          auth.workspaceId,
          { subjectType: "organization", subjectId: organization.id },
          body,
          auth.userId ?? null,
        );
        const dbRow = await loadCrmActivityRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordCrmActivityRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        nudgeCrmActivityLive(auth, row.id, "upsert");
        return c.json(row, 201);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "INVALID_NOTE_BODY" ||
            error.message === "INVALID_OCCURRED_AT")
        ) {
          return c.json(
            {
              error: {
                code: error.message,
                message: "Invalid note activity payload.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );

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
      nudgePeerEntityLive(auth, "area", row.id, "upsert");
      return c.json(toArea(row), 201);
    }
    const row = await circleService.createArea(auth.workspaceId, body);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "area", row.id, "upsert");
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
      if (!row) return c.json(notFound("Area"), 404);
      nudgePeerEntityLive(auth, "area", row.id, "upsert");
      return c.json(toArea(row));
    }
    const row = await circleService.updateArea(auth.workspaceId, areaId, patch);
    if (!row) return c.json(notFound("Area"), 404);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "area", row.id, "upsert");
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
      nudgePeerEntityLive(auth, "area", areaId, "delete");
      return c.body(null, 204);
    }
    const row = await circleService.deleteArea(auth.workspaceId, areaId);
    if (!row) return c.json(notFound("Area"), 404);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "delete");
    nudgePeerEntityLive(auth, "area", row.id, "delete");
    return c.body(null, 204);
  });

}
