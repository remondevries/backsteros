/**
 * Seal bunq secret columns under BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY.
 * Covers ciphertext still under the old shared key AND plaintext values.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/reencrypt-bunq-secrets-to-dedicated-key.ts
 *     → dry-run: prints counts only, writes nothing (safe while core is up).
 *   ... --apply
 *     → writes. Requires CORE_REPLICATION_ROLE=cloud, dedicated key set, and
 *       the cloud core STOPPED (GET /health must not return ok:true).
 *
 * Never prints secret values. Does not call bunq. No-ops when the dedicated
 * key is unset. Each column write is compare-and-set against the value that
 * was planned. Decrypt-back (rollback) still works after this pass as long as
 * the dedicated key remains set.
 *
 * Stop the cloud core before --apply:
 *   docker compose -f deploy/cloud/docker-compose.yml stop backsteros
 */
import { sqlClient } from "../db/index.js";
import {
  reencryptBunqSecretsToDedicatedKey,
} from "../services/bunq-secrets-reencrypt.js";

function parseArgs(argv: readonly string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--") continue;
    else throw new Error(`unknown argument: ${arg} (only --apply is supported)`);
  }
  return { apply };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const result = await reencryptBunqSecretsToDedicatedKey({ dryRun: !apply });

  if (result.skippedNoKey) {
    console.log(
      "BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY is unset — nothing to do.",
    );
    return;
  }

  console.log(
    [
      `dryRun=${result.dryRun}`,
      `rows=${result.rows}`,
      `columns=${result.columns}`,
      `plaintextColumns=${result.plaintextColumns}`,
      `alreadyDedicated=${result.alreadyDedicated}`,
      `casSkipped=${result.casSkipped}`,
      `failed=${result.failedColumns.length}`,
    ].join(" "),
  );
  for (const fail of result.failedColumns) {
    console.log(`  failed ${fail.workspaceId} ${fail.field}`);
  }
  if (!apply) {
    console.log(
      "\nDRY RUN — nothing changed. Stop the cloud core, then re-run with --apply to write.",
    );
  }
  if (result.failedColumns.length > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end({ timeout: 2 });
  });
