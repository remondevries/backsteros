import { cursorCoversLocalTip } from "./cursor-order.js";
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
  isExcludedFromPendingUnpushed,
  isPendingCoveredByAck,
  nextPendingAckSnapshot,
  parseAcknowledgePendingBody,
  resolveAcknowledgePendingSnapshot,
  shouldPauseSyncEventPull,
  summarizeUnpushedTables,
  sumLocalOnlyRows,
  toPendingAckSnapshot,
  type PendingAckSnapshot,
  type PendingUnpushedState,
} from "./pending-unpushed-policy.js";
import { listReplicationReconcileMismatches } from "./reconcile.js";

export {
  emptyPendingUnpushedState,
  formatPendingUnpushedSummary,
  hasPendingUnpushedState,
  isExcludedFromPendingUnpushed,
  isPendingCoveredByAck,
  nextPendingAckSnapshot,
  parseAcknowledgePendingBody,
  resolveAcknowledgePendingSnapshot,
  shouldPauseSyncEventPull,
  summarizeUnpushedTables,
  sumLocalOnlyRows,
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

  const entries: { table: string; count: number }[] = [];
  for (const table of tables) {
    // Tables not pushed by design never gate ordered sync-event pull.
    if (isExcludedFromPendingUnpushed(table)) continue;
    const [tip, pushCursor] = await Promise.all([
      fetchLocalTableTip(table),
      getReplicationCursor(table, "push"),
    ]);
    // cursorCoversLocalTip also treats ms-truncated legacy cursors that still
    // point at the tip row (Postgres µs vs JS Date ms) as caught up (OS-110).
    if (!tip || cursorCoversLocalTip(pushCursor, tip)) {
      continue;
    }
    entries.push({
      table,
      count: await countLocalChangesSince(table, pushCursor),
    });
  }

  const { unpushedRowCount, unpushedTables } = summarizeUnpushedTables(entries);
  const localOnlyRowCount = sumLocalOnlyRows(mismatches);

  return {
    unpushedRowCount,
    openDeadLetterCount,
    localOnlyRowCount,
    unpushedTables,
  };
}
