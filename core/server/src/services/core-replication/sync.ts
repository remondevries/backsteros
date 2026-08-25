export {
  applyRemoteChanges,
  bootstrapTableFromPeer,
  sanitizeApiKeyRow,
} from "./apply.js";
export {
  compareCursor,
  getReplicationCursor,
  maxCursor,
  setReplicationCursor,
  tableExists,
  toIso,
} from "./cursors.js";
export {
  fetchAllLocalRows,
  fetchLocalChanges,
  listActiveBootstrapTables,
  listActiveReplicatedTables,
} from "./fetch.js";

import { fetchLocalChanges } from "./fetch.js";
import type { ReplicatedTable } from "./constants.js";
import type { ReplicationChangesResponse, ReplicationCursor } from "./types.js";

export async function getChangesSince(
  table: ReplicatedTable,
  since: ReplicationCursor,
): Promise<ReplicationChangesResponse> {
  const { changes, cursor } = await fetchLocalChanges(table, since);
  return { table, changes, cursor };
}
