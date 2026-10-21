/**
 * Download Brandfetch icons for organizations missing avatars and store them.
 *
 *   cd core/server && pnpm exec tsx --env-file=.env src/scripts/hydrate-org-brandfetch-avatars.ts
 *   # cloud:
 *   BRANDFETCH_CLIENT_ID=… WORKSPACE_ID=ws_legacy_default pnpm exec tsx src/scripts/hydrate-org-brandfetch-avatars.ts
 */
import { brandfetchClientIdFromEnv, hydrateOrganizationLogosFromBrandfetch } from "../services/brandfetch-org-avatar.js";

async function main() {
  const workspaceId =
    process.env.WORKSPACE_ID?.trim() || "ws_legacy_default";
  const clientId = brandfetchClientIdFromEnv();
  if (!clientId) {
    console.error(
      "Set BRANDFETCH_CLIENT_ID (or VITE_BRANDFETCH_CLIENT_ID) before hydrating.",
    );
    process.exit(1);
  }
  console.log(
    `Hydrating Brandfetch logos for workspace=${workspaceId} (client id present, len=${clientId.length})…`,
  );
  const result = await hydrateOrganizationLogosFromBrandfetch(workspaceId, {
    concurrency: 4,
    force: process.env.FORCE === "1",
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
