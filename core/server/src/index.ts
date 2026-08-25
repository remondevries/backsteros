import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { assertPowerSyncSecrets } from "./lib/secrets.js";
import {
  ensureVaultStructure,
  setVaultPathCache,
} from "./lib/storage.js";
import {
  assertReplicationListenHost,
  getCoreReplicationConfig,
} from "./services/core-replication/config.js";
import { startCoreReplicationWorker } from "./services/core-replication/worker.js";
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

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST?.trim() || "127.0.0.1";

try {
  assertReplicationListenHost(host);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const replicationConfig = getCoreReplicationConfig();
if (replicationConfig) {
  console.log(
    `Core replication enabled (${replicationConfig.role}) → peer ${replicationConfig.peerUrl}`,
  );
}

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    console.log(`backsteros-server listening on http://${host}:${info.port}`);
    console.log(`OpenAPI: http://${host}:${info.port}/api/v1/openapi.json`);
    startRecurringTaskRunner();
    startCoreReplicationWorker();
  },
);
