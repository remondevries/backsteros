import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encryptBunqSecret } from "../lib/bunq-secret-crypto.js";
import {
  BunqRollbackRefusedError,
  bunqRollbackRefusalReason,
  decryptBunqSecretsForRollback,
  type BunqRollbackRow,
} from "./bunq-secrets-rollback.js";

const CLOUD_ENV = {
  CORE_REPLICATION_ROLE: "cloud",
  BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: "bunq-key",
  BACKSTEROS_SECRET_ENCRYPTION_KEY: "shared-key",
} as NodeJS.ProcessEnv;

function rows(): BunqRollbackRow[] {
  return [
    {
      workspaceId: "w1",
      bunqApiKey: encryptBunqSecret("api-1", CLOUD_ENV),
      bunqSessionToken: encryptBunqSecret("sess-1", {
        BACKSTEROS_SECRET_ENCRYPTION_KEY: "shared-key",
      } as NodeJS.ProcessEnv),
      bunqInstallationToken: null,
      bunqSigningPrivateKeyPem: "plaintext-pem",
    },
    {
      workspaceId: "w2",
      bunqApiKey: encryptBunqSecret("x", {
        BACKSTEROS_SECRET_ENCRYPTION_KEY: "unknown-key",
      } as NodeJS.ProcessEnv),
    },
  ];
}

describe("bunqRollbackRefusalReason", () => {
  it("allows role=cloud, or --confirm-cloud when the role is unset", () => {
    assert.equal(bunqRollbackRefusalReason({ CORE_REPLICATION_ROLE: "cloud" } as NodeJS.ProcessEnv, false), null);
    assert.equal(bunqRollbackRefusalReason({} as NodeJS.ProcessEnv, true), null);
    assert.ok(bunqRollbackRefusalReason({} as NodeJS.ProcessEnv, false));
  });

  it("always refuses an explicit local role", () => {
    const local = { CORE_REPLICATION_ROLE: "local" } as NodeJS.ProcessEnv;
    assert.ok(bunqRollbackRefusalReason(local, false));
    assert.ok(bunqRollbackRefusalReason(local, true));
  });
});

describe("decryptBunqSecretsForRollback", () => {
  it("refuses when not cloud and writes nothing", async () => {
    await assert.rejects(
      () =>
        decryptBunqSecretsForRollback(
          { dryRun: false },
          {
            env: { CORE_REPLICATION_ROLE: "local" } as NodeJS.ProcessEnv,
            loadRows: async () => {
              throw new Error("must not load");
            },
          },
        ),
      (error: unknown) => error instanceof BunqRollbackRefusedError,
    );
  });

  it("is a dry-run by default: counts, reports failures, writes nothing", async () => {
    let writes = 0;
    const result = await decryptBunqSecretsForRollback(
      {},
      {
        env: CLOUD_ENV,
        loadRows: async () => rows(),
        applyPatch: async () => {
          writes += 1;
        },
      },
    );
    assert.equal(writes, 0);
    assert.deepEqual(result, {
      dryRun: true,
      rows: 1,
      columns: 2,
      failedColumns: [{ workspaceId: "w2", field: "bunqApiKey" }],
    });
  });

  it("with dryRun=false writes plaintext only for decryptable columns", async () => {
    const written: Record<string, Record<string, string>> = {};
    const result = await decryptBunqSecretsForRollback(
      { dryRun: false },
      {
        env: CLOUD_ENV,
        loadRows: async () => rows(),
        applyPatch: async (workspaceId, patch) => {
          written[workspaceId] = patch as Record<string, string>;
        },
      },
    );
    assert.equal(result.dryRun, false);
    assert.deepEqual(written, {
      w1: { bunqApiKey: "api-1", bunqSessionToken: "sess-1" },
    });
    assert.equal(result.failedColumns.length, 1);
  });
});
