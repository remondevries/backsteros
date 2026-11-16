import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCAL_BUNQ_CLEAR_PATCH,
  LocalBunqSecretsRefusedError,
  clearLocalBunqSecrets,
} from "./bunq-local-secrets.js";

describe("clearLocalBunqSecrets", () => {
  it("defaults to a dry-run that only counts", async () => {
    let cleared = 0;
    const result = await clearLocalBunqSecrets(
      {},
      {
        env: { CORE_REPLICATION_ROLE: "local" },
        countRows: async () => 3,
        clearRows: async () => {
          cleared += 1;
          return 3;
        },
      },
    );
    assert.deepEqual(result, { dryRun: true, affectedRows: 3 });
    assert.equal(cleared, 0);
  });

  it("clears when dryRun is explicitly false", async () => {
    const seen: Array<string | null> = [];
    const result = await clearLocalBunqSecrets(
      { dryRun: false, workspaceId: "w1" },
      {
        env: {},
        clearRows: async (workspaceId) => {
          seen.push(workspaceId);
          return 1;
        },
      },
    );
    assert.deepEqual(result, { dryRun: false, affectedRows: 1 });
    assert.deepEqual(seen, ["w1"]);
  });

  it("refuses on a cloud core, even when not a dry-run", async () => {
    await assert.rejects(
      () =>
        clearLocalBunqSecrets(
          { dryRun: false },
          {
            env: { CORE_REPLICATION_ROLE: "cloud" },
            clearRows: async () => {
              throw new Error("must not run");
            },
          },
        ),
      (error: unknown) => error instanceof LocalBunqSecretsRefusedError,
    );
  });

  it("nulls every credential column", () => {
    assert.deepEqual(Object.keys(LOCAL_BUNQ_CLEAR_PATCH).sort(), [
      "bunqApiKey",
      "bunqDeviceId",
      "bunqEnvironment",
      "bunqInstallationToken",
      "bunqLastConnectedAt",
      "bunqServerPublicKeyPem",
      "bunqSessionExpiresAt",
      "bunqSessionToken",
      "bunqSigningPrivateKeyPem",
      "bunqUserId",
    ]);
    for (const value of Object.values(LOCAL_BUNQ_CLEAR_PATCH)) {
      assert.equal(value, null);
    }
  });
});
