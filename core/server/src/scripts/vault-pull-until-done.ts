/**
 * Pull all markdown from the replication peer into the local vault.
 * Run after fixing cloud-core vault path resolution when recovery is needed.
 *
 * Usage: pnpm vault:pull-until-done
 */
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { syncVaultWithPeer } from "../services/core-replication/vault-replication.js";

const MAX_ROUNDS = 500;
const PAGE_SIZE = 100;

async function main() {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    console.error(
      "Set CORE_REPLICATION_ROLE=local, CORE_REPLICATION_PEER_URL, and CORE_REPLICATION_SECRET.",
    );
    process.exit(1);
  }

  console.log(`Pulling vault markdown from peer ${config.peerUrl} …`);

  let round = 0;
  let totalApplied = 0;

  for (;;) {
    round += 1;
    if (round > MAX_ROUNDS) {
      console.error(`Stopped after ${MAX_ROUNDS} rounds — peer may still have remaining files.`);
      process.exit(1);
    }

    const { pull } = await syncVaultWithPeer({
      pageSize: PAGE_SIZE,
      timeoutMs: 300_000,
    });

    if (!pull) {
      console.error("Vault pull skipped — check BACKSTEROS_VAULT_PATH and replication config.");
      process.exit(1);
    }

    totalApplied += pull.applied;
    console.log(
      `round ${round}: applied=${pull.applied} skipped=${pull.skipped} remaining=${pull.remaining}`,
    );

    if (pull.remaining <= 0 && pull.applied === 0) {
      console.log(`Vault pull complete (${totalApplied} files applied across ${round} rounds).`);
      break;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
