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
 * key is unset. Each column write is compare-and-set against the exact raw DB
 * value. Exits 2 when casSkipped>0 or failed>0. Decrypt-back still restores
 * byte-identical plaintext after this pass (keep the dedicated key set).
 *
 * Stop the cloud core before --apply:
 *   docker compose -f deploy/cloud/docker-compose.yml stop backsteros
 */
import { sqlClient } from "../db/index.js";
import {
  bunqReencryptScriptExitCode,
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
  const code = bunqReencryptScriptExitCode(result);
  if (code !== 0) {
    console.error(
      `\nRefusing success: casSkipped=${result.casSkipped} failed=${result.failedColumns.length}`,
    );
    process.exitCode = code;
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
