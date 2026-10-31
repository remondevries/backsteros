/**
 * Shared dependency surface for the large route modules (schemas, services,
 * sync recorders, route-shared helpers). Route files import what they use
 * from here instead of repeating a ~375-line import header.
 */
export {
  avatarSignedUrlQuerySchema,
  bankAccountCashflowQuerySchema,
  bankAccountInputSchema,
  bankAccountsMonthIncomeQuerySchema,
  batchDeleteFinancialTransactionsSchema,
  batchUpdateFinancialTransactionsSchema,
  cashflowPlannerEntryInputSchema,
  contactLookupQuerySchema,
  contactRelationshipInputSchema,
  createApiKeySchema,
  createCrmActivityNoteSchema,
  createDocumentSchema,
  createEmailThreadCommentSchema,
  createHabitSchema,
  createMeetingSchema,
  createPortalContactLogSchema,
  createProjectSchema,
  createProjectUpdateSchema,
  createTaskActivitySchema,
  createTaskCommentSchema,
  createTaskSchema,
  crmActivityFeedQuerySchema,
  crmGroupInputSchema,
  crmGroupMemberInputSchema,
  crmRelationshipLabelInputSchema,
  deleteDevicePushTokenSchema,
  documentRetrievalQuerySchema,
  emailAgentDraftInputSchema,
  emailComposeDraftInputSchema,
  emailConceptReplyInputSchema,
  emailStartThreadInputSchema,
  financeAssetsDebtQuerySchema,
  financeSpendPanelQuerySchema,
  financialCategoryInputSchema,
  financialGoalInputSchema,
  financialRecurringInputSchema,
  listActivitiesQuerySchema,
  listDocumentsQuerySchema,
  listExternalCalendarEventsQuerySchema,
  listFinancialTransactionsQuerySchema,
  listTaskAgentPresenceQuerySchema,
  locationFsCreateFolderSchema,
  locationFsListQuerySchema,
  mapboxGeocodeQuerySchema,
  mapboxStaticMapQuerySchema,
  moneybirdBankAccountSyncQuerySchema,
  moneybirdInvoiceRevenueQuerySchema,
  moneybirdSalesInvoicesQuerySchema,
  portalAuthLoginSchema,
  projectFsCreateEntrySchema,
  projectFsWriteFileSchema,
  publicAvatarQuerySchema,
  putDocumentPropertiesSchema,
  recordHabitDaySchema,
  reorderLetterAttachmentsSchema,
  reorderTaskAttachmentsSchema,
  researchRequestSchema,
  spellcheckRequestSchema,
  taskImageUploadInputSchema,
  updateAgentMailDraftSchema,
  updateAgentMailSettingsSchema,
  updateApiKeySchema,
  updateAutoReviewWebhookSettingsSchema,
  updateBankAccountSchema,
  updateBrandfetchSettingsSchema,
  updateCashflowPlannerEntrySchema,
  updateCloudflareDnsRecordSchema,
  updateCloudflareSettingsSchema,
  updateContactRelationshipSchema,
  updateCrmGroupSchema,
  updateCrmRelationshipLabelSchema,
  updateCursorSettingsSchema,
  updateDocumentContentSchema,
  updateDocumentSchema,
  updateDocumentSectionSchema,
  updateEmailThreadCommentSchema,
  updateEmailThreadMetadataSchema,
  updateFinancialCategorySchema,
  updateFinancialGoalSchema,
  updateFinancialRecurringSchema,
  updateFinancialTransactionSchema,
  updateGithubSettingsSchema,
  updateGoogleCalendarSettingsSchema,
  updateHabitSchema,
  updateMapboxSettingsSchema,
  updateMeetingSchema,
  updateMoneybirdSettingsSchema,
  updateProjectSchema,
  updateProjectUpdateSchema,
  updateTaskCommentSchema,
  updateTaskSchema,
  updateTaskTimerSessionActorSchema,
  updateTransipDomainContactsInputSchema,
  updateTransipDomainNameserversInputSchema,
  updateTransipSettingsSchema,
  updateVaultStorageSettingsSchema,
  upsertDevicePushTokenSchema,
  upsertTaskAgentPresenceSchema,
  workspaceCashflowQuerySchema,
} from "@backsteros/contracts";
export {
  zValidator,
} from "@hono/zod-validator";
export type {
  Context,
  Hono,
  Next,
} from "hono";
export {
  bodyLimit,
} from "hono/body-limit";
export {
  streamSSE,
} from "hono/streaming";
export {
  z,
} from "zod";
export {
  db,
} from "../db/index.js";
export {
  subscribeAgentPresence,
} from "../lib/agent-presence-events.js";
export {
  assertCanSetAgentWorking,
} from "../lib/agent-working.js";
export {
  AgentMailApiError,
} from "../lib/agentmail-client.js";
export {
  handleAgentMailWebhookDelivery,
  svixHeadersFromRequest,
} from "../lib/agentmail-webhook.js";
export {
  normalizeAvatarMimeType,
  resolveAvatarContentType,
  sniffAvatarContentType,
} from "../lib/avatar-content-type.js";
export {
  buildAvatarSignedUrl,
  getAvatarUrlSigningSecret,
  getPublicApiOrigin,
  isAvatarSignedEntityType,
  verifyAvatarSignature,
} from "../lib/avatar-signed-url.js";
export {
  CloudflareApiError,
} from "../lib/cloudflare-client.js";
export {
  newId,
} from "../lib/crypto.js";
export {
  parseDocumentListTypeFilter,
  parseExactMultiQueryValues,
  parseMultiQueryValues,
  resolveSectionIfMatchVersion,
} from "../lib/document-property-filters.js";
export {
  readDocumentSection,
  replaceDocumentSectionBody,
} from "../lib/document-sections.js";
export {
  subscribeEmailUpdated,
} from "../lib/email-inbox-events.js";
export {
  resolveContactRef,
  resolveOrganizationRef,
  resolveProjectRef,
  resolveTaskListFilterRefs,
  resolveTaskRef,
  resolveTaskWriteRefs,
} from "../lib/entity-refs.js";
export {
  GoogleCalendarApiError,
} from "../lib/google-calendar-client.js";
export {
  readIdempotencyKey,
  withIdempotency,
} from "../lib/idempotency.js";
export {
  assertDocumentListTypeValue,
  collectQueryParams,
  CONTACTS_LIST_PAGINATED_ONLY_KEYS,
  DOCUMENTS_DEFAULT_LIMIT,
  DUE_TASKS_LIST_PAGINATED_ONLY_KEYS,
  EMAIL_MESSAGES_LIST_PAGINATED_ONLY_KEYS,
  ignoredLegacyListKeys,
  LETTERS_LIST_PAGINATED_ONLY_KEYS,
  ListQueryError,
  MEETINGS_LIST_PAGINATED_ONLY_KEYS,
  ORGANIZATIONS_LIST_PAGINATED_ONLY_KEYS,
  paginateByUpdatedAtId,
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
  PROJECTS_LIST_PAGINATED_ONLY_KEYS,
} from "../lib/list-query.js";
export {
  MapboxApiError,
} from "../lib/mapbox-client.js";
export {
  toApiKey,
  toArea,
  toBankAccount,
  toCashflowPlannerEntry,
  toDocument,
  toFinancialCategory,
  toFinancialGoal,
  toFinancialImportBatch,
  toFinancialRecurring,
  toFinancialTransaction,
  toProject,
  toSearchResult,
  toTask,
  toTaskActivity,
  toTaskComment,
} from "../lib/mappers.js";
export {
  MoneybirdApiError,
} from "../lib/moneybird-client.js";
export {
  PortalUsernameConflictError,
} from "../lib/portal-contact-auth.js";
export {
  hashPortalPassword,
  verifyPortalPassword,
} from "../lib/portal-password.js";
export {
  canManageApiKeys,
} from "../lib/powersync-auth.js";
export {
  proxyErrorStatus,
} from "../lib/proxy-http-status.js";
export {
  toPublicContact,
} from "../lib/public-contact.js";
export {
  blobReadsRequireLocalCore,
} from "../lib/r2-object-store.js";
export {
  resolveVaultPath,
} from "../lib/storage.js";
export type {
  SyncEntity,
} from "../lib/sync-constants.js";
export {
  resolveTaskAttachmentContentType,
} from "../lib/task-attachment-content-type.js";
export {
  ignoredLegacyTaskListKeys,
  parseTaskListQuery,
  TASK_LIST_DEFAULT_EXCLUSION_HINT,
  TaskFilterError,
  taskListUsesDefaultStatusExclusion,
} from "../lib/task-filters.js";
export {
  normalizeTaskImageMimeType,
  resolveTaskImageContentType,
  sniffTaskImageContentType,
} from "../lib/task-image-content-type.js";
export {
  TransipApiError,
} from "../lib/transip-client.js";
export {
  MAX_AVATAR_BYTES,
  MAX_TASK_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
} from "../lib/upload-limits.js";
export {
  isWorkspaceUpdatedKind,
  publishDocumentWorkspaceUpdated,
  publishEntityWorkspaceUpdated,
  publishMeetingWorkspaceUpdated,
  publishProjectUpdateWorkspaceUpdated,
  publishProjectWorkspaceUpdated,
  publishTaskWorkspaceUpdated,
  subscribeWorkspaceUpdated,
} from "../lib/workspace-events.js";
export {
  writeActorForComment,
  writeActorFromAuth,
} from "../lib/write-actor.js";
export {
  isOwnerShellAuth,
  logUnauthorizedRequest,
  requireScope,
  resolveAuth,
} from "../middleware/auth.js";
export type {
  AuthContext,
} from "../middleware/auth.js";
export {
  AgentPtyUnavailableError,
  getAgentPtyConnection,
} from "../services/agent-pty.js";
export {
  runAgentRetrieve,
} from "../services/agent-search.js";
export * as agentmailSettingsService from "../services/agentmail-settings.js";
export * as apiKeyService from "../services/api-keys.js";
export * as autoReviewWebhookService from "../services/auto-review-webhook.js";
export * as brandfetchSettingsService from "../services/brandfetch-settings.js";
export * as circleService from "../services/crm-domain.js";
export * as cloudflareSettingsService from "../services/cloudflare-settings.js";
export * as cloudflareZoneOpsService from "../services/cloudflare-zone-ops.js";
export * as cloudflareZonesSyncService from "../services/cloudflare-zones-sync.js";
export {
  commitDocumentContentLeaderFirst,
  commitDocumentPropertiesLeaderFirst,
} from "../services/core-replication/leader-mutations.js";
export {
  notifyPeerOfDocumentWrite,
  notifyPeerOfEntityWrite,
} from "../services/core-replication/nudge.js";
export {
  isForeignKeyViolation,
} from "../services/core-replication/soft-unique-conflicts.js";
export * as crmActivitiesService from "../services/crm-activities.js";
export * as crmGroupsService from "../services/crm-groups.js";
export * as crmRelationshipLabelsService from "../services/crm-relationship-labels.js";
export * as cursorSettingsService from "../services/cursor-settings.js";
export { getCursorUsageForWorkspace } from "../services/cursor-usage.js";
export {
  listCursorModels,
  researchText,
  SpellcheckError,
  spellcheckText,
  testCursorConnection,
} from "../services/cursor-spellcheck.js";
export {
  DocumentPropertyError,
  getDocumentProperties,
  putDocumentProperties,
} from "../services/document-properties.js";
export * as documentService from "../services/documents.js";
export * as emailThreadsService from "../services/email-threads.js";
export * as financeService from "../services/finance/finance.js";
export * as moneybirdBankSyncService from "../services/finance/moneybird-sync.js";
export {
  resolveGithubAccessToken,
} from "../services/github-auth.js";
export * as githubSettingsService from "../services/github-settings.js";
export * as githubService from "../services/github.js";
export * as googleCalendarSettingsService from "../services/google-calendar-settings.js";
export {
  emitHabitTaskSyncChanges,
} from "../services/habit-task-sync.js";
export * as habitService from "../services/habits.js";
export * as locationFsService from "../services/location-fs.js";
export * as mapboxSettingsService from "../services/mapbox-settings.js";
export * as meetingSchedulingService from "../services/meeting-scheduling.js";
export * as meetingService from "../services/meetings.js";
export {
  meetingExternalCalendarHttpError,
} from "../services/meetings.js";
export * as moneybirdSettingsService from "../services/moneybird-settings.js";
export * as portalContactLogsService from "../services/portal-contact-logs.js";
export * as projectFsService from "../services/project-fs.js";
export * as projectUpdatesService from "../services/project-updates.js";
export * as projectVaultService from "../services/project-vault.js";
export * as pushInboxTriageService from "../services/push-inbox-triage.js";
export {
  buildAreaRestPayload,
  buildBankAccountRestPayload,
  buildCashflowPlannerRestPayload,
  buildContactRelationshipRestPayload,
  buildContactRestPayload,
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
export {
  buildLetterSyncPayloadFromRow,
  loadContactRelationshipRow,
  loadCrmActivityRow,
  loadCrmGroupMemberRow,
  loadCrmGroupRow,
  loadCrmRelationshipLabelRow,
  recordAreaRestSyncEvent,
  recordBankAccountRestSyncEvent,
  recordCashflowPlannerRestSyncEvent,
  recordContactRelationshipRestSyncEvent,
  recordContactRestSyncEvent,
  recordCrmActivityRestSyncEvent,
  recordCrmGroupMemberRestSyncEvent,
  recordCrmGroupRestSyncEvent,
  recordCrmRelationshipLabelRestSyncEvent,
  recordDocumentRestSyncEvent,
  recordEmailThreadCommentRestSyncEvent,
  recordEmailThreadRestSyncEvent,
  recordFinancialCategoryRestSyncEvent,
  recordFinancialGoalRestSyncEvent,
  recordFinancialRecurringRestSyncEvent,
  recordFinancialTransactionRestSyncEvent,
  recordHabitRestSyncEvent,
  recordLetterRestSyncEvent,
  recordMeetingDerivedCrmActivityRestSyncEvents,
  recordMeetingRestSyncEvent,
  recordMentionRestSyncEvent,
  recordOrganizationRestSyncEvent,
  recordProjectRestSyncEvent,
  recordTaskActivityRestSyncEvent,
  recordTaskCommentRestSyncEvent,
  recordTaskRestSyncEvent,
  recordWorkspaceSettingRestSyncEvent,
} from "../services/sync.js";
export * as taskActivityService from "../services/task-activities.js";
export * as taskAgentPresenceService from "../services/task-agent-presence.js";
export * as taskAttachmentService from "../services/task-attachments.js";
export * as taskCommentService from "../services/task-comments.js";
export {
  attachImagesToCommentBody,
  attachImagesToTaskDescription,
} from "../services/task-image-attach.js";
export * as taskImageService from "../services/task-images.js";
export * as taskProjectService from "../services/tasks-projects.js";
export * as transipDomainsSyncService from "../services/transip-domains-sync.js";
export * as transipSettingsService from "../services/transip-settings.js";
export * as vaultSettingsService from "../services/vault-settings.js";
export * as whoopService from "../services/whoop.js";
export {
  can,
  forbidden,
  getAuth,
  isAgentPersonaAuth,
  listQueryErrorBody,
  notFound,
  nudgePeerEntityLive,
  unauthorized,
} from "./route-helpers.js";
export {
  areaSchema,
  avatarEntityToSyncEntity,
  contactSchema,
  contactSocialAccountSchema,
  emitBackfilledHabitSync,
  emitLetterMetadataSync,
  idListSchema,
  letterSchema,
  meetingWeekdayHoursEntrySchema,
  meetingWeekdayHoursSlotSchema,
  nudgeContactLive,
  nudgeContactRelationshipLive,
  nudgeCrmActivityLive,
  nudgeCrmGroupLive,
  nudgeCrmGroupMemberLive,
  nudgeCrmRelationshipLabelLive,
  nudgeOrganizationLive,
  organizationSchema,
  prepareContactWriteBody,
  publishDocumentLiveFromAgent,
  publishMeetingLive,
  publishProjectLive,
  publishTaskLive,
  reorderSchema,
  requireResolvedRef,
  routeContactId,
  routeOrganizationId,
  routeProjectId,
  routeTaskId,
  sanitizeWorkspaceSettings,
  type TaskRow,
  tasksWithKeys,
  taskWithKey,
  updateMeetingSchedulingSettingsSchema,
  withAuth,
} from "./route-shared.js";
