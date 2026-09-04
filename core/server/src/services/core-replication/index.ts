/**
 * Public barrel for core-replication (current Linear-shaped worker API).
 * Stale outbox/LWW helper names from an earlier draft are intentionally gone.
 */
export { applyRemoteChanges, bootstrapTableFromPeer } from "./apply.js";
export {
  getCoreReplicationConfig,
  isCoreReplicationEnabled,
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
export { getChangesSince } from "./sync.js";
export {
  startCoreReplicationWorker,
  stopCoreReplicationWorker,
  runCoreReplicationTick,
} from "./worker.js";
export { registerCoreReplicationRoutes } from "./routes.js";
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
