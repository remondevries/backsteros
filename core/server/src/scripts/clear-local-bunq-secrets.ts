/**
 * H2 — null bunq_* credentials on a LOCAL core (cloud-core owns them).
 *
 *   pnpm exec tsx --env-file=<local env> src/scripts/clear-local-bunq-secrets.ts
 *     → dry-run: prints how many rows still hold bunq credentials.
 *   ... --apply
 *     → nulls them. Refused unless CORE_REPLICATION_ROLE=local is set
 *       explicitly AND DATABASE_URL points at a loopback host.
 *
 * Destructive: only run against the local DB you intend to scrub.
 */
import { sqlClient } from "../db/index.js";
import { clearLocalBunqSecrets } from "../services/bunq-local-secrets.js";

const apply = process.argv.includes("--apply");

try {
  const result = await clearLocalBunqSecrets({ dryRun: !apply });
  console.log(
    result.dryRun
      ? `[dry-run] ${result.affectedRows} workspace row(s) hold bunq credentials. Re-run with --apply to clear.`
      : `Cleared bunq credentials on ${result.affectedRows} workspace row(s).`,
  );
} finally {
  await sqlClient.end();
}
