import { compareCursor } from "./cursor-order.js";
import { getReplicationCursor } from "./cursors.js";
import { countOpenReplicationDeadLetters } from "./dead-letters.js";
import {
  countLocalChangesSince,
  fetchLocalTableTip,
  listActiveReplicatedTables,
} from "./fetch.js";
import {
  emptyPendingUnpushedState,
  formatPendingUnpushedSummary,
  hasPendingUnpushedState,
  isPendingCoveredByAck,
  nextPendingAckSnapshot,
  shouldPauseSyncEventPull,
  toPendingAckSnapshot,
  type PendingAckSnapshot,
  type PendingUnpushedState,
} from "./pending-unpushed-policy.js";
import { listReplicationReconcileMismatches } from "./reconcile.js";

export {
  emptyPendingUnpushedState,
  formatPendingUnpushedSummary,
  hasPendingUnpushedState,
  isPendingCoveredByAck,
  nextPendingAckSnapshot,
  shouldPauseSyncEventPull,
  toPendingAckSnapshot,
  type PendingAckSnapshot,
  type PendingUnpushedState,
};

/**
 * Local-core state that ordered cloud sync-event pull must not overwrite
 * until Remon confirms: unpushed table rows (push cursor behind local tip),
 * open apply dead letters, and reconcile rows missing on the peer.
 */
export async function getPendingUnpushedState(): Promise<PendingUnpushedState> {
  const [tables, openDeadLetterCount, mismatches] = await Promise.all([
    listActiveReplicatedTables(),
    countOpenReplicationDeadLetters(),
    listReplicationReconcileMismatches(),
  ]);

  const unpushedTables: string[] = [];
  let unpushedRowCount = 0;
  for (const table of tables) {
    const [tip, pushCursor] = await Promise.all([
      fetchLocalTableTip(table),
      getReplicationCursor(table, "push"),
    ]);
    if (!tip || compareCursor(tip, pushCursor) <= 0) {
      continue;
    }
    const count = await countLocalChangesSince(table, pushCursor);
    if (count > 0) {
      unpushedRowCount += count;
      unpushedTables.push(table);
    }
  }

  const localOnlyRowCount = mismatches.reduce(
    (sum, row) => sum + (row.missingOnPeer ?? 0),
    0,
  );

  return {
    unpushedRowCount,
    openDeadLetterCount,
    localOnlyRowCount,
    unpushedTables,
  };
}
