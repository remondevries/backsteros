/**
 * Download Brandfetch icons for organizations missing avatars and store them.
 *
 *   cd core/server && pnpm exec tsx --env-file=.env src/scripts/hydrate-org-brandfetch-avatars.ts
 *   # cloud:
 *   BRANDFETCH_CLIENT_ID=… WORKSPACE_ID=ws_legacy_default pnpm exec tsx src/scripts/hydrate-org-brandfetch-avatars.ts
 */
import {
  brandfetchApiKeyFromEnv,
  hydrateOrganizationLogosFromBrandfetch,
} from "../services/brandfetch-org-avatar.js";

async function main() {
  const workspaceId =
    process.env.WORKSPACE_ID?.trim() || "ws_legacy_default";
  const apiKey = brandfetchApiKeyFromEnv();
  if (!apiKey) {
    console.error("Set BRANDFETCH_API_KEY before hydrating.");
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
