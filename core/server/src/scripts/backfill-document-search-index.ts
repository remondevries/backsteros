/**
 * Backfill document_search_index.search_body from vault/R2 (OS-80).
 * Safe for backsteros_test. Do not point DATABASE_URL at live `backsteros`.
 *
 *   DATABASE_URL=postgres://…/backsteros_test \
 *   pnpm --filter @backsteros/server exec tsx src/scripts/backfill-document-search-index.ts \
 *     [--workspace <id>] [--limit N]
 */
import { parseArgs } from "node:util";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/\/backsteros(\?|$)/.test(databaseUrl) && !/backsteros_test/.test(databaseUrl)) {
    console.error("Refusing to backfill the live backsteros database.");
    process.exit(2);
  }

  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      limit: { type: "string" },
    },
  });

  const { backfillDocumentSearchBodies } = await import(
    "../services/document-search-index.js"
  );
  const result = await backfillDocumentSearchBodies({
    workspaceId: values.workspace?.trim() || undefined,
    limit: values.limit ? Number(values.limit) : undefined,
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
