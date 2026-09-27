/**
 * One-off: rebuild documents.properties (+ mirrors / doc keys) from vault
 * front matter for a workspace.
 *
 * Usage:
 *   pnpm --filter @backsteros/server exec tsx --env-file=.env \
 *     src/scripts/rebuild-document-properties.ts [workspaceId]
 */
import { rebuildDocumentPropertiesFromVault } from "../services/document-properties.js";

async function main() {
  const workspaceId =
    process.argv[2]?.trim() ||
    process.env.CORE_REPLICATION_WORKSPACE_IDS?.split(",")[0]?.trim() ||
    process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    console.error(
      "Usage: rebuild-document-properties.ts <workspaceId>\n" +
        "Or set CORE_REPLICATION_WORKSPACE_IDS / WORKSPACE_ID.",
    );
    process.exit(1);
  }

  const result = await rebuildDocumentPropertiesFromVault(workspaceId);
  console.log(JSON.stringify({ workspaceId, ...result }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
