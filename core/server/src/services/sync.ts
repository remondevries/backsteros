/**
 * Sync engine barrel — implementation lives in `./sync/`.
 * Keep importing from `services/sync.js`; module boundaries are internal.
 */
export {
  appendSyncEvent,
  getWorkspaceLastSyncId,
  recordRestEntitySyncEvent,
} from "./sync-log.js";
export {
  bootstrapSync,
  pullSync,
} from "./sync/bootstrap-pull.js";
export type {
  SyncChange,
  SyncMutation,
  ApplySyncChangeOptions,
} from "./sync/types.js";
export {
  buildLetterSyncPayloadFromRow,
} from "./sync/snapshots.js";
export {
  recordDocumentContentSyncEvent,
  recordDocumentRestSyncEvent,
  recordTaskRestSyncEvent,
  taskRowToSyncPayload,
  recordProjectRestSyncEvent,
  recordAreaRestSyncEvent,
  recordOrganizationRestSyncEvent,
  recordContactRestSyncEvent,
  recordLetterRestSyncEvent,
  recordMentionRestSyncEvent,
  recordHabitRestSyncEvent,
  recordMeetingRestSyncEvent,
  recordTaskCommentRestSyncEvent,
  recordTaskActivityRestSyncEvent,
  loadTaskActivityRow,
  recordContactRelationshipRestSyncEvent,
  recordCrmRelationshipLabelRestSyncEvent,
  recordCrmGroupRestSyncEvent,
  recordCrmGroupMemberRestSyncEvent,
  recordCrmActivityRestSyncEvent,
  loadContactRelationshipRow,
  loadCrmRelationshipLabelRow,
  loadCrmGroupRow,
  loadCrmGroupMemberRow,
  loadCrmActivityRow,
  recordWorkspaceSettingRestSyncEvent,
  recordBankAccountRestSyncEvent,
  recordFinancialCategoryRestSyncEvent,
  recordFinancialGoalRestSyncEvent,
  recordFinancialRecurringRestSyncEvent,
  recordCashflowPlannerRestSyncEvent,
  recordFinancialTransactionRestSyncEvent,
  recordEmailThreadRestSyncEvent,
  recordEmailThreadCommentRestSyncEvent,
  recordRecurringTaskRestSyncEvent,
} from "./sync/rest-sync-events.js";
export {
  recordMeetingDerivedCrmActivityRestSyncEvents,
  mergeHabitDerivedTaskChanges,
} from "./sync/derived-events.js";
export {
  isPowerSyncSkippableError,
  mapProjectUpsert,
} from "./sync/payload-mappers.js";
export {
  applySyncChange,
} from "./sync/apply-sync-change.js";
export {
  pushSyncMutations,
} from "./sync/push-mutations.js";
export {
  applyPowerSyncBatch,
} from "./sync/powersync-batch.js";
