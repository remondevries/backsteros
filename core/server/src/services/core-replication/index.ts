export { applyRemoteChanges, applyReplicationRow, bootstrapTableFromPeer } from "./apply.js";
export {
  getCoreReplicationConfig,
  isCoreReplicationEnabled,
  isSyncEventPullEnabled,
  setSyncEventPullRuntimeEnabled,
  acknowledgePendingSyncEventPull,
  getPendingSyncEventPullAck,
  syncPendingAckWithState,
  resolveReplicationIntervalMs,
  type CoreReplicationConfig,
  type CoreReplicationRole,
} from "./config.js";
export {
  BOOTSTRAP_TABLES,
  REPLICATED_TABLES,
  type ReplicatedTable,
} from "./constants.js";
export { isApplyingReplication, withReplicationApply } from "./context.js";
export {
  countOpenReplicationDeadLetters,
  listOpenReplicationDeadLetters,
  retryReplicationDeadLetters,
} from "./dead-letters.js";
export {
  computeTableFingerprint,
  isReplicationReconcileEnabled,
  listReplicationReconcileMismatches,
  runReplicationReconcile,
} from "./reconcile.js";
export { getChangesSince } from "./sync.js";
export {
  startCoreReplicationWorker,
  stopCoreReplicationWorker,
  runCoreReplicationTick,
} from "./worker.js";
export { registerCoreReplicationRoutes } from "./routes.js";
export {
  ensureLocalCoreControlToken,
  verifyLocalCoreControlAuthorization,
  localCoreControlTokenPath,
} from "./local-core-control-token.js";
export {
  pullPeerSyncEvents,
  buildSyncEventsFeed,
} from "./sync-event-replication.js";
export {
  notifyPeerOfDocumentWrite,
  notifyReplicaOfCloudWrite,
  handleReplicationNudge,
} from "./nudge.js";
export { publishWorkspaceUpdatedFromSyncEvent } from "./sync-event-live-publish.js";
export {
  isAvatarStorageKey,
  fetchAvatarFromPeer,
  replicateAvatarsForKeys,
  verifyAvatarReplicationAuth,
} from "./avatar-replication.js";
