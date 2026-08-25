/**
 * One-shot bootstrap: copy BOOTSTRAP_TABLES rows from the peer core into this
 * database. Run on both sides once when pairing local-core and cloud-core.
 *
 * Previously only the Meetings portal key was copied; api_keys now replicates
 * all rows and stays in lockstep via the live worker (REPLICATED_TABLES).
 */
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { BOOTSTRAP_TABLES } from "../services/core-replication/constants.js";
import { bootstrapTableFromPeer } from "../services/core-replication/sync.js";
import { isImplementedReplicatedTable } from "../services/core-replication/tables.js";
import type { ReplicationChange } from "../services/core-replication/types.js";

async function fetchPeerBootstrapRows(
  table: (typeof BOOTSTRAP_TABLES)[number],
): Promise<ReplicationChange[]> {
  const config = getCoreReplicationConfig();
  if (!config) {
    throw new Error(
      "CORE_REPLICATION_PEER_URL and CORE_REPLICATION_SECRET are required",
    );
  }

  if (!isImplementedReplicatedTable(table)) {
    console.log(`skip ${table} (no handler in this core build)`);
    return [];
  }

  const url = new URL(`${config.peerUrl}/internal/core-replication/bootstrap`);
  url.searchParams.set("table", table);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`bootstrap fetch ${table} failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as { changes: ReplicationChange[] };
  return payload.changes;
}

async function main() {
  const config = getCoreReplicationConfig();
  if (!config) {
    console.error(
      "Set CORE_REPLICATION_PEER_URL and CORE_REPLICATION_SECRET before running bootstrap.",
    );
    process.exit(1);
  }

  console.log(`Bootstrapping from peer ${config.peerUrl} (${config.role})`);

  for (const table of BOOTSTRAP_TABLES) {
    if (!isImplementedReplicatedTable(table)) {
      console.log(`skip ${table} (not implemented on this core)`);
      continue;
    }

    const changes = await fetchPeerBootstrapRows(table);
    const result = await bootstrapTableFromPeer(table, changes);
    console.log(
      `${table}: ${changes.length} rows from peer → ${result.applied} applied, ${result.skipped} skipped`,
    );
  }

  console.log("Bootstrap complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
