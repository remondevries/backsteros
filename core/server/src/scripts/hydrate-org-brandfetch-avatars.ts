/**
 * Download Brandfetch icons for organizations missing avatars and store them.
 *
 * Uses the workspace Brandfetch integration key (Settings → Brandfetch), with
 * optional `BRANDFETCH_API_KEY` env bootstrap.
 *
 *   cd core/server && pnpm exec tsx --env-file=.env src/scripts/hydrate-org-brandfetch-avatars.ts
 *   # cloud:
 *   WORKSPACE_ID=ws_legacy_default node dist/scripts/hydrate-org-brandfetch-avatars.js
 */
import { getBrandfetchApiKey } from "../services/brandfetch-settings.js";
import { hydrateOrganizationLogosFromBrandfetch } from "../services/brandfetch-org-avatar.js";

async function main() {
  const workspaceId =
    process.env.WORKSPACE_ID?.trim() || "ws_legacy_default";
  const apiKey = await getBrandfetchApiKey(workspaceId);
  if (!apiKey) {
    console.error(
      "No Brandfetch API key — save one in Settings → Integrations → Brandfetch, or set BRANDFETCH_API_KEY.",
    );
    process.exit(1);
  }
  console.log(
    `Hydrating Brandfetch logos for workspace=${workspaceId} (api key present, len=${apiKey.length})…`,
  );
  const result = await hydrateOrganizationLogosFromBrandfetch(workspaceId, {
    concurrency: 3,
    force: process.env.FORCE === "1",
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
