/**
 * Backfill document_search_index.search_body from vault/R2 (OS-80).
 *
 * Test DB (default):
 *   DATABASE_URL=postgres://…/backsteros_test \
 *   pnpm --filter @backsteros/server exec tsx src/scripts/backfill-document-search-index.ts \
 *     [--workspace <id>] [--batch-size 50] [--pause-ms 200] [--after-id <id>]
 *
 * Live `backsteros` requires an explicit opt-in. Do not run this against live
 * from an agent session. Remon:
 *   DATABASE_URL=postgresql://…/backsteros \
 *   pnpm --filter @backsteros/server exec tsx src/scripts/backfill-document-search-index.ts \
 *     --allow-live --batch-size 50 --pause-ms 250
 *
 * Resume from the last printed `lastId`:
 *   … --allow-live --after-id <lastId>
 */
import { parseArgs } from "node:util";

import {
  backfillDocumentSearchBodiesAll,
  isLiveBacksterosDatabaseUrl,
} from "../services/document-search-index.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      "batch-size": { type: "string" },
      "pause-ms": { type: "string" },
      "after-id": { type: "string" },
      "allow-live": { type: "boolean", default: false },
    },
  });

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (isLiveBacksterosDatabaseUrl(databaseUrl) && !values["allow-live"]) {
    console.error(
      "Refusing to backfill the live backsteros database. Re-run with --allow-live if you intend to.",
    );
    process.exit(2);
  }

  const result = await backfillDocumentSearchBodiesAll({
    workspaceId: values.workspace?.trim() || undefined,
    batchSize: values["batch-size"] ? Number(values["batch-size"]) : 50,
    pauseMs: values["pause-ms"] ? Number(values["pause-ms"]) : 0,
    afterId: values["after-id"]?.trim() || undefined,
    onProgress: (batch, totals) => {
      console.log(
        JSON.stringify({
          batch,
          totals,
        }),
      );
    },
  });
  console.log(JSON.stringify({ done: true, ...result }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
