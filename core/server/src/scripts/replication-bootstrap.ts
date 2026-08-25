/**
 * One-shot bootstrap: copy BOOTSTRAP_TABLES rows from the peer core into this
 * database. Peer must be the other core directly (Tailscale / localhost) — not
 * the agents HTTPS door.
 */
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { BOOTSTRAP_TABLES } from "../services/core-replication/constants.js";
import { bootstrapTableFromPeer } from "../services/core-replication/apply.js";
import { listActiveBootstrapTables } from "../services/core-replication/fetch.js";
import { tableExists } from "../services/core-replication/cursors.js";
import type { ReplicationChange } from "../services/core-replication/types.js";

async function fetchPeerBootstrapRows(
  table: string,
): Promise<ReplicationChange[]> {
  const config = getCoreReplicationConfig();
  if (!config) {
    throw new Error(
      "CORE_REPLICATION_PEER_URL and CORE_REPLICATION_SECRET are required",
    );
  }

  if (!(await tableExists(table))) {
    console.log(`skip ${table} (table not present on this core)`);
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
      "Set CORE_REPLICATION_PEER_URL (other core Tailscale/localhost URL — not agent.backsteros.com) " +
        "and CORE_REPLICATION_SECRET before running bootstrap.",
    );
    process.exit(1);
  }

  console.log(`Bootstrapping from peer ${config.peerUrl} (${config.role})`);

  const activeTables = await listActiveBootstrapTables();
  const ordered = BOOTSTRAP_TABLES.filter((table) => activeTables.includes(table));

  for (const table of ordered) {
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
