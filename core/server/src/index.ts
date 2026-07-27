import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { assertPowerSyncSecrets } from "./lib/secrets.js";
import {
  ensureVaultStructure,
  setVaultPathCache,
} from "./lib/storage.js";
import { startRecurringTaskRunner } from "./services/recurring-tasks.js";

assertPowerSyncSecrets();

const envVault = process.env.BACKSTEROS_VAULT_PATH?.trim();
if (envVault) {
  setVaultPathCache(envVault);
  void ensureVaultStructure(envVault).catch((error) => {
    console.warn(
      `Could not bootstrap vault at ${envVault}:`,
      error instanceof Error ? error.message : error,
    );
  });
}

const port = Number(process.env.PORT ?? 8787);

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`backsteros-server listening on http://localhost:${info.port}`);
    console.log(`OpenAPI: http://localhost:${info.port}/api/v1/openapi.json`);
    startRecurringTaskRunner();
  },
);
