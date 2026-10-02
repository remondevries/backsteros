/**
 * Repeatable document-retrieve stage timing against the local DB + vault.
 *
 * Usage (from repo root, against backsteros_test only):
 *
 *   DATABASE_URL=postgres://…/backsteros_test \
 *   BACKSTEROS_VAULT_PATH=/path/to/vault \
 *   pnpm --filter @backsteros/server exec tsx src/scripts/measure-document-retrieve.ts \
 *     --workspace <workspaceId> --q "decision" --runs 5
 *
 * Prints per-stage ms (SQL / body / rank / total). Cloud before/after requires
 * a deploy (not part of this script). Set DOCUMENT_RETRIEVAL_LOG_EVERY=1 on the
 * server to log the same stages for every retrieve call.
 */
import { parseArgs } from "node:util";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      q: { type: "string", default: "decision" },
      runs: { type: "string", default: "5" },
      limit: { type: "string", default: "20" },
      candidateLimit: { type: "string", default: "100" },
    },
  });

  const workspaceId = values.workspace?.trim();
  if (!workspaceId) {
    console.error(
      "Usage: measure-document-retrieve.ts --workspace <id> [--q text] [--runs N]",
    );
    process.exit(2);
  }

  const runs = Math.max(1, Number(values.runs ?? 5) || 5);
  const q = values.q?.trim() || "decision";
  const limit = Math.max(1, Number(values.limit ?? 20) || 20);
  const candidateLimit = Math.max(
    1,
    Number(values.candidateLimit ?? 100) || 100,
  );

  const { retrieveDocuments } = await import("../services/documents.js");
  const { resetDocumentRetrievalBodyCacheForTests } = await import(
    "../lib/document-retrieval.js"
  );

  console.log(
    JSON.stringify({
      workspaceId,
      q,
      runs,
      limit,
      candidateLimit,
      note: "First run is cold (no body cache). Later runs reuse in-process cache when etags match.",
    }),
  );

  for (let i = 0; i < runs; i += 1) {
    if (i === 0) {
      resetDocumentRetrievalBodyCacheForTests();
    }
    const result = await retrieveDocuments({
      workspaceId,
      q,
      limit,
      candidateLimit,
    });
    console.log(
      JSON.stringify({
        run: i + 1,
        hits: result.results.length,
        skipped: result.skipped,
        truncated: result.truncated,
        timing: result.timing,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
