/**
 * Shared schemas + live-update helpers for split route modules (OS-73).
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


export const { sanitizeWorkspaceSettings } = cursorSettingsService;

export const idListSchema = z.object({ ids: z.array(z.string()).min(1).max(500) });
export const reorderSchema = z.object({ orderedIds: z.array(z.string()).min(1).max(500) });
export const organizationSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  summary: z.string().max(2000).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  email: z.string().email().nullable().optional(),
  emails: z
    .array(
      z.object({
        label: z.enum(["general", "support", "other"]),
        address: z.string().email().max(320),
      }),
    )
    .max(20)
    .optional(),
  phones: z
    .array(
      z.object({
        label: z.enum(["general", "support", "other"]),
        number: z.string().min(1).max(64),
      }),
    )
    .max(20)
    .optional(),
  website: z.string().url().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  region: z.string().max(128).nullable().optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  size: z.string().max(64).nullable().optional(),
  socialAccounts: z
    .array(
      z.object({
        platform: z.string().min(1).max(64),
        url: z.string().min(1).max(2048),
      }),
    )
    .max(20)
    .optional(),
  chamberOfCommerce: z.string().max(64).nullable().optional(),
  taxNumber: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  moneybirdContactId: z.string().max(64).nullable().optional(),
});
export const contactSocialAccountSchema = z.object({
  platform: z.string().min(1).max(64),
  url: z.string().min(1).max(500),
});
export const contactSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  organizationId: z.string().nullable().optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().max(255).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().nullable().optional(),
  emails: z
    .array(
      z.object({
        label: z.enum(["personal", "work", "other"]),
        address: z.string().email(),
      }),
    )
    .max(20)
    .optional(),
  title: z.string().max(255).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  phone: z.string().max(64).nullable().optional(),
  phones: z
    .array(
      z.object({
        label: z.enum(["personal", "work", "other"]),
        number: z.string().min(1).max(64),
      }),
    )
    .max(20)
    .optional(),
  role: z.string().max(255).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  region: z.string().max(128).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema).max(20).optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable()
    .optional(),
  languages: z
    .array(z.enum(["nl", "en", "de", "es", "fr", "pl"]))
    .max(5)
    .optional(),
  portalUsername: z.string().trim().min(1).max(128).nullable().optional(),
  portalPassword: z
    .union([z.string().min(8).max(256), z.literal(""), z.null()])
    .optional(),
  portalSettings: z
    .object({
      languages: z
        .array(z.enum(["nl", "en", "de", "es", "fr", "pl"]))
        .optional(),
      language: z.enum(["en", "nl"]).optional(),
      enabledProjectIds: z.array(z.string()).nullable().optional(),
      financials: z.boolean().optional(),
      support: z.boolean().optional(),
      canAddTickets: z.boolean().optional(),
      canAddTasks: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});
export const areaSchema = z.object({
  name: z.string().min(1).max(255),
  parent: z.enum(["personal", "business", "clients"]),
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const meetingWeekdayHoursSlotSchema = z.object({
  start: z.string().min(1).max(8),
  end: z.string().min(1).max(8),
});
export const meetingWeekdayHoursEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  enabled: z.boolean(),
  slots: z.array(meetingWeekdayHoursSlotSchema).min(1).max(12),
});
export const updateMeetingSchedulingSettingsSchema = z.object({
  label: z.string().max(200).optional(),
  timezone: z.string().min(1).max(128).optional(),
  weekdayHours: z.array(meetingWeekdayHoursEntrySchema).min(1).max(7).optional(),
  durationsMinutes: z.array(z.union([z.literal(30), z.literal(60)])).optional(),
  minNoticeMinutes: z.number().int().nonnegative().optional(),
  bufferMinutes: z.number().int().nonnegative().optional(),
  horizonDays: z.number().int().positive().max(365).optional(),
  enabled: z.boolean().optional(),
});
export const letterSchema = z.object({
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







export type TaskRow = Parameters<typeof toTask>[0];

/** Task API shape including display key, projectKey, assigneeName (OS-45/OS-64). */
export async function taskWithKey(
  workspaceId: string,
  row: TaskRow,
  extras?: {
    comment?: ReturnType<typeof toTaskComment>;
    comments?: Array<ReturnType<typeof toTaskComment>>;
  },
) {
  const projectKey = row.projectId
    ? (
        await taskProjectService.getProjectKeyMap(workspaceId, [row.projectId])
      ).get(row.projectId) ?? null
    : null;
  const names = await taskProjectService.getContactNameMap(workspaceId, [
    row.assigneeId,
    row.agentWorkingContactId,
  ]);
  const assigneeName = row.assigneeId
    ? (names.get(row.assigneeId) ?? null)
    : null;
  const agentWorkingContactName = row.agentWorkingContactId
    ? (names.get(row.agentWorkingContactId) ?? null)
    : null;
  return {
    ...toTask(row, projectKey),
    projectKey,
    assigneeName,
    agentWorkingContactName,
    ...(extras?.comment ? { comment: extras.comment } : {}),
    ...(extras?.comments ? { comments: extras.comments } : {}),
  };
}

/** List variant of taskWithKey: one project-key + assignee-name query for all rows. */
export async function tasksWithKeys(workspaceId: string, rows: TaskRow[]) {
  if (!rows.length) return [];
  const keys = await taskProjectService.getProjectKeyMap(
    workspaceId,
    rows.map((row) => row.projectId),
  );
  const names = await taskProjectService.getContactNameMap(
    workspaceId,
    [
      ...rows.map((row) => row.assigneeId),
      ...rows.map((row) => row.agentWorkingContactId),
    ],
  );
  return rows.map((row) => {
    const projectKey = row.projectId ? (keys.get(row.projectId) ?? null) : null;
    const assigneeName = row.assigneeId
      ? (names.get(row.assigneeId) ?? null)
      : null;
    const agentWorkingContactName = row.agentWorkingContactId
      ? (names.get(row.agentWorkingContactId) ?? null)
      : null;
    return {
      ...toTask(row, projectKey),
      projectKey,
      assigneeName,
      agentWorkingContactName,
    };
  });
}





/** Resolve a filter id/key; unknown → 400 (OS-58/OS-59). */
export async function requireResolvedRef(
  workspaceId: string,
  ref: string | undefined,
  field: "projectId" | "organizationId" | "contactId",
): Promise<string | undefined> {
  if (ref == null || ref === "") return undefined;
  const resolved =
    field === "projectId"
      ? await resolveProjectRef(workspaceId, ref)
      : field === "organizationId"
        ? await resolveOrganizationRef(workspaceId, ref)
        : await resolveContactRef(workspaceId, ref);
  if (!resolved) {
    throw new ListQueryError(`Unknown ${field.replace(/Id$/, "")}`, field);
  }
  return resolved;
}

/** OS-58: path/filter refs may be internal ids or human keys. */
export async function routeTaskId(workspaceId: string, ref: string) {
  return resolveTaskRef(workspaceId, ref);
}

export async function routeProjectId(workspaceId: string, ref: string) {
  return resolveProjectRef(workspaceId, ref);
}

export async function routeOrganizationId(workspaceId: string, ref: string) {
  return resolveOrganizationRef(workspaceId, ref);
}

export async function routeContactId(workspaceId: string, ref: string) {
  return resolveContactRef(workspaceId, ref);
}

/** Hash write-only `portalPassword` into `portalPasswordHash` for REST / leader payloads. */
export async function prepareContactWriteBody<T extends Record<string, unknown>>(
  body: T,
): Promise<T & { portalPasswordHash?: string | null }> {
  if (!Object.prototype.hasOwnProperty.call(body, "portalPassword")) {
    return body;
  }
  const { portalPassword, ...rest } = body as T & {
    portalPassword?: string | null;
  };
  const next = { ...rest } as T & { portalPasswordHash?: string | null };
  if (portalPassword === null || portalPassword === "") {
    next.portalPasswordHash = null;
  } else if (typeof portalPassword === "string") {
    next.portalPasswordHash = await hashPortalPassword(portalPassword);
  }
  return next;
}

export function avatarEntityToSyncEntity(entityType: string): SyncEntity | null {
  if (entityType === "organization") return "organization";
  if (entityType === "contact") return "contact";
  if (entityType === "bank_account") return "bank_account";
  return null;
}

export async function withAuth(c: Context, next: Next) {
  if (
    c.req.path.startsWith("/api/v1/sync") ||
    c.req.path.startsWith("/api/v1/powersync") ||
    c.req.path === "/api/v1/webhooks/agentmail" ||
    c.req.path.startsWith("/api/v1/public/avatars/") ||
    c.req.path.startsWith("/api/v1/public/spaces/") ||
    c.req.path.startsWith("/api/v1/public/file-task-callbacks/") ||
    c.req.path.startsWith("/api/v1/public/email-agent-callbacks/")
  ) {
    await next();
    return;
  }

  const auth = await resolveAuth(c.req.header("Authorization"));
  if (!auth) {
    // OS-63: identify silent 401 pollers (UA + key name, never the secret).
    const url = new URL(c.req.url);
    void logUnauthorizedRequest({
      method: c.req.method,
      path: `${url.pathname}${url.search}`,
      userAgent: c.req.header("User-Agent"),
      authorization: c.req.header("Authorization"),
    });
    return c.json(unauthorized(), 401);
  }
  c.set("auth", auth);
  await next();
  if (auth.kind === "api_key") {
    // OS-45: which agent key made which call (name only, never the secret).
    const url = new URL(c.req.url);
    console.log(
      `[api-key] ${JSON.stringify(auth.apiKeyName ?? auth.apiKeyId ?? "?")} ${c.req.method} ${url.pathname}${url.search} ${c.res.status}`,
    );
  }
}



/**
 * Agent API-key writes → workspace SSE on this core + nudge the peer core
 * (cloud↔local) so the other side refreshes without waiting for the tick.
 * Clerk/desktop saves already update local SQLite optimistically; content
 * still nudges the peer so cloud vault/SSE stay live.
 */
export function publishDocumentLiveFromAgent(
  auth: AuthContext,
  documentId: string,
  input?: {
    projectId?: string | null;
    contentVersion?: number | null;
    operation?: "upsert" | "delete";
    storageKey?: string | null;
  },
): void {
  if (auth.kind === "api_key") {
    publishDocumentWorkspaceUpdated(auth.workspaceId, documentId, {
      projectId: input?.projectId,
      contentVersion: input?.contentVersion,
      operation: input?.operation,
    });
  }
  notifyPeerOfDocumentWrite({
    workspaceId: auth.workspaceId,
    reason: "document",
    entity: "document",
    entityId: documentId,
    storageKey: input?.storageKey ?? null,
    contentVersion: input?.contentVersion ?? null,
    operation: input?.operation ?? "upsert",
    projectId: input?.projectId ?? null,
  });
}

/**
 * REST/agent project writes → local SSE + peer nudge so desktop/portal
 * refresh before PowerSync / the replication tick.
 */
export function publishProjectLive(
  auth: AuthContext,
  projectId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  publishProjectWorkspaceUpdated(auth.workspaceId, projectId, { operation });
  notifyPeerOfDocumentWrite({
    workspaceId: auth.workspaceId,
    reason: "project",
    entity: "project",
    entityId: projectId,
    operation,
    projectId,
  });
}

/**
 * REST/agent meeting writes → local SSE + peer nudge so calendar / meeting
 * property UIs refresh before PowerSync mirrors the row.
 */
export function publishMeetingLive(
  auth: AuthContext,
  meetingId: string,
  input?: {
    projectId?: string | null;
    operation?: "upsert" | "delete";
  },
): void {
  const operation = input?.operation ?? "upsert";
  publishMeetingWorkspaceUpdated(auth.workspaceId, meetingId, {
    projectId: input?.projectId ?? null,
    operation,
  });
  notifyPeerOfDocumentWrite({
    workspaceId: auth.workspaceId,
    reason: "meeting",
    entity: "meeting",
    entityId: meetingId,
    operation,
    projectId: input?.projectId ?? null,
  });
}

/**
 * REST/agent task writes → local SSE + peer nudge so task lists refresh
 * before PowerSync / the replication tick (parity with documents/meetings).
 */
export function publishTaskLive(
  auth: AuthContext,
  taskId: string,
  input?: {
    projectId?: string | null;
    operation?: "upsert" | "delete";
  },
): void {
  const operation = input?.operation ?? "upsert";
  publishTaskWorkspaceUpdated(auth.workspaceId, taskId, {
    projectId: input?.projectId ?? null,
    reason: "patch",
    operation,
  });
  notifyPeerOfDocumentWrite({
    workspaceId: auth.workspaceId,
    reason: "task",
    entity: "task",
    entityId: taskId,
    operation,
    projectId: input?.projectId ?? null,
  });
}

/**
 * CRM activity notes → local SSE + peer nudge (parity with contacts / meetings).
 */
export function nudgeCrmActivityLive(
  auth: AuthContext,
  activityId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "crm_activity", activityId, operation);
}

/**
 * Any sync-entity REST write → local workspace SSE + peer nudge so open
 * desktop shells refresh before PowerSync mirrors; peer stays in lockstep.
 */


export function nudgeContactLive(
  auth: AuthContext,
  contactId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "contact", contactId, operation);
}

export function nudgeOrganizationLive(
  auth: AuthContext,
  organizationId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "organization", organizationId, operation);
}

export function nudgeContactRelationshipLive(
  auth: AuthContext,
  relationshipId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "contact_relationship", relationshipId, operation);
}

export function nudgeCrmGroupMemberLive(
  auth: AuthContext,
  memberId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "crm_group_member", memberId, operation);
}

export function nudgeCrmGroupLive(
  auth: AuthContext,
  groupId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "crm_group", groupId, operation);
}

export function nudgeCrmRelationshipLabelLive(
  auth: AuthContext,
  labelId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  nudgePeerEntityLive(auth, "crm_relationship_label", labelId, operation);
}

/** After letter attachment mutations, sync denormalized letter metadata (not PDF bytes). */
export async function emitLetterMetadataSync(
  workspaceId: string,
  letterId: string,
): Promise<void> {
  const letter = await circleService.getLetterById(workspaceId, letterId);
  if (!letter) return;
  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWrite({
      workspaceId,
      entity: "letter",
      entityId: letter.id,
      operation: "upsert",
      payload: buildLetterSyncPayloadFromRow(letter),
    });
  } else {
    await recordLetterRestSyncEvent(workspaceId, letter, "upsert");
  }
}

export async function emitBackfilledHabitSync(
  workspaceId: string,
  backfilledHabits: Awaited<
    ReturnType<typeof habitService.listHabits>
  >["backfilledHabits"],
): Promise<void> {
  if (backfilledHabits.length === 0) return;

  const projectId = backfilledHabits[0]?.projectId;
  if (projectId) {
    const project = await taskProjectService.getProjectById(
      workspaceId,
      projectId,
    );
    if (project) {
      if (isRestLeaderFirstWrite()) {
        await commitRestEntityWrite({
          workspaceId,
          entity: "project",
          entityId: project.id,
          operation: "upsert",
          payload: buildProjectRestPayload(project.id, {
            key: project.key,
            name: project.name,
            summary: project.summary,
            description: project.description,
            organizationId: project.organizationId,
            areaId: project.areaId,
            area: project.area,
            startDate: project.startDate?.toISOString() ?? null,
            dueDate: project.dueDate?.toISOString() ?? null,
            icon: project.icon,
            color: project.color,
            status: project.status,
            priority: project.priority,
            sortOrder: project.sortOrder,
            type: project.type,
          }),
        });
      } else {
        await recordProjectRestSyncEvent(workspaceId, project, "upsert");
      }
    }
  }

  for (const habit of backfilledHabits) {
    if (isRestLeaderFirstWrite()) {
      await commitRestEntityWrite({
        workspaceId,
        entity: "habit",
        entityId: habit.id,
        operation: "upsert",
        payload: buildHabitRestPayload(habit.id, {
          title: habit.title,
          icon: habit.icon,
          description: habit.description,
          projectId: habit.projectId,
          cadence: habit.cadence,
          sortOrder: habit.sortOrder,
        }),
      });
    } else {
      await recordHabitRestSyncEvent(workspaceId, habit, "upsert");
    }
  }
}


