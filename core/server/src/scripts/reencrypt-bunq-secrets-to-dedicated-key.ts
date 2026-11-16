/**
 * Re-seal bunq `v1:` columns from the old shared encryption key onto
 * BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/reencrypt-bunq-secrets-to-dedicated-key.ts
 *     → dry-run: prints counts only, writes nothing.
 *   ... --apply
 *     → writes. Requires CORE_REPLICATION_ROLE=cloud.
 *
 * Never prints secret values. Does not call bunq. No-ops when the dedicated
 * key is unset. Decrypt-back (rollback) still works after this pass as long as
 * the dedicated key remains set.
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
      `alreadyDedicated=${result.alreadyDedicated}`,
      `failed=${result.failedColumns.length}`,
    ].join(" "),
  );
  for (const fail of result.failedColumns) {
    console.log(`  failed ${fail.workspaceId} ${fail.field}`);
  }
  if (!apply) {
    console.log(
      "\nDRY RUN — nothing changed. Re-run with --apply to write re-sealed columns.",
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
