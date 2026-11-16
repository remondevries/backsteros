/**
 * Round 4 one-off: retry ONLY five meeting dead letters and acknowledge every
 * other open replication dead letter.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/retry-meeting-dead-letters-and-ack-rest.ts
 *     → dry-run: prints the plan, writes nothing.
 *   ... --confirm-cloud
 *     → executes against whatever DATABASE_URL points at. Only pass this flag
 *       when DATABASE_URL is the cloud-core database you intend to change.
 *
 * Retry = apply the stored dead-letter payload through the normal replication
 * apply path (the same one retryReplicationDeadLetterById uses). Acknowledge =
 * mark resolved without applying. A failed retry leaves that letter open.
 */
import { and, asc, isNull } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { replicationDeadLetters } from "../db/schema.js";
import { applyReplicationRow } from "../services/core-replication/apply.js";
import {
  acknowledgeReplicationDeadLetter,
  retryReplicationDeadLetterById,
} from "../services/core-replication/dead-letters.js";
import {
  RETRY_MEETING_ROW_IDS,
  describeDatabaseTarget,
  executeDeadLetterCleanup,
  parseCleanupArgs,
  planDeadLetterCleanup,
  type OpenDeadLetterRef,
} from "../services/core-replication/dead-letter-cleanup.js";

async function listAllOpenDeadLetters(): Promise<OpenDeadLetterRef[]> {
  const rows = await db
    .select({
      id: replicationDeadLetters.id,
      tableName: replicationDeadLetters.tableName,
      rowId: replicationDeadLetters.rowId,
      direction: replicationDeadLetters.direction,
    })
    .from(replicationDeadLetters)
    .where(and(isNull(replicationDeadLetters.resolvedAt)))
    .orderBy(asc(replicationDeadLetters.firstSeenAt));
  return rows;
}

function formatLetter(letter: OpenDeadLetterRef): string {
  return `${letter.tableName} ${letter.rowId} (${letter.direction}) [${letter.id}]`;
}

async function main() {
  const { confirmCloud } = parseCleanupArgs(process.argv.slice(2));

  console.log(`target: ${describeDatabaseTarget(process.env.DATABASE_URL)}`);
  const open = await listAllOpenDeadLetters();
  const plan = planDeadLetterCleanup(open);

  console.log(`open dead letters: ${open.length}`);
  console.log(`retry (${plan.retry.length}) — only these meeting row ids:`);
  for (const id of RETRY_MEETING_ROW_IDS) console.log(`  ${id}`);
  for (const letter of plan.retry) console.log(`  retry   ${formatLetter(letter)}`);
  if (plan.retryRowIdsWithoutOpenLetter.length > 0) {
    console.log(
      `no open letter for: ${plan.retryRowIdsWithoutOpenLetter.join(", ")}`,
    );
  }
  console.log(`acknowledge (${plan.acknowledge.length}):`);
  for (const letter of plan.acknowledge) {
    console.log(`  ack     ${formatLetter(letter)}`);
  }

  if (!confirmCloud) {
    console.log(
      "\nDRY RUN — nothing changed. Re-run with --confirm-cloud to execute this plan.",
    );
    return;
  }

  console.log("\n--confirm-cloud set: executing…");
  const result = await executeDeadLetterCleanup(plan, {
    retryById: (id) => retryReplicationDeadLetterById(id, applyReplicationRow),
    acknowledgeById: acknowledgeReplicationDeadLetter,
  });
  for (const { letter, status } of result.retried) {
    console.log(`retry ${status}: ${formatLetter(letter)}`);
  }
  for (const { letter, status } of result.acknowledged) {
    console.log(`ack ${status}: ${formatLetter(letter)}`);
  }
  const failedRetries = result.retried.filter((entry) => entry.status !== "resolved");
  if (failedRetries.length > 0) {
    console.error(`${failedRetries.length} retry(ies) did not resolve; letters left open.`);
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
