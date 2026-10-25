import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import type { IntegrationSecretStore } from "./integration-secret-settings.js";

export type IntegrationSecretColumn =
  | "brandfetchApiKey"
  | "cloudflareApiToken"
  | "githubApiToken"
  | "mapboxAccessToken";

/** One column of `workspace_integration_secrets`, upserted per workspace. */
export function workspaceIntegrationSecretStore(
  column: IntegrationSecretColumn,
): IntegrationSecretStore {
  return {
    async read(workspaceId) {
      const [row] = await db
        .select({ value: workspaceIntegrationSecrets[column] })
        .from(workspaceIntegrationSecrets)
        .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
        .limit(1);
      return row?.value ?? null;
    },
    async write(workspaceId, value) {
      await db
        .insert(workspaceIntegrationSecrets)
        .values({ workspaceId, [column]: value })
        .onConflictDoUpdate({
          target: workspaceIntegrationSecrets.workspaceId,
          set: { [column]: value, updatedAt: new Date() },
        });
    },
  };
}
