/**
 * Rollback: decrypt `v1:` bunq credential columns back to plaintext so c0475b9
 * (pre bunq-at-rest encryption) can read them. CLOUD-oriented.
 *
 *   pnpm exec tsx --env-file=<cloud env> src/scripts/decrypt-bunq-secrets-for-rollback.ts
 *     → dry-run (default): prints how many rows/columns would be decrypted.
 *   ... --apply
 *     → writes plaintext back. Needs the same key(s) that sealed the values
 *       (BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY / BACKSTEROS_SECRET_ENCRYPTION_KEY /
 *       CORE_REPLICATION_SECRET).
 *   --workspace <id>   limit to one workspace
 *   --confirm-cloud    required unless CORE_REPLICATION_ROLE=cloud
 *
 * Refused on CORE_REPLICATION_ROLE=local. Destructive (removes encryption at
 * rest): only run deliberately against the cloud DB you are rolling back.
 * Never prints secret values.
 */
import { sqlClient } from "../db/index.js";
import {
  BunqRollbackRefusedError,
  decryptBunqSecretsForRollback,
} from "../services/bunq-secrets-rollback.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmCloud = args.includes("--confirm-cloud");
const workspaceFlag = args.indexOf("--workspace");
const workspaceId =
  workspaceFlag >= 0 ? (args[workspaceFlag + 1]?.trim() || null) : null;

let exitCode = 0;
try {
  const result = await decryptBunqSecretsForRollback({
    dryRun: !apply,
    confirmCloud,
    workspaceId,
  });
  console.log(
    result.dryRun
      ? `[dry-run] ${result.columns} column(s) on ${result.rows} workspace row(s) would be decrypted to plaintext. Re-run with --apply to write.`
      : `Decrypted ${result.columns} column(s) on ${result.rows} workspace row(s) to plaintext.`,
  );
  if (result.failedColumns.length > 0) {
    exitCode = 1;
    console.error(
      `Could not decrypt ${result.failedColumns.length} column(s) (no configured key matches):`,
    );
    for (const { workspaceId: id, field } of result.failedColumns) {
      console.error(`  workspace=${id} column=${field}`);
    }
  }
} catch (error) {
  if (error instanceof BunqRollbackRefusedError) {
    console.error(error.message);
    exitCode = 2;
  } else {
    throw error;
  }
} finally {
  await sqlClient.end();
}
process.exit(exitCode);
