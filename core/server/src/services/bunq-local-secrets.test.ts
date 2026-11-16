import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCAL_BUNQ_CLEAR_PATCH,
  LocalBunqSecretsRefusedError,
  clearLocalBunqSecrets,
  localBunqClearRefusalReason,
} from "./bunq-local-secrets.js";

const LOCAL_ENV = {
  CORE_REPLICATION_ROLE: "local",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/backsteros",
} as NodeJS.ProcessEnv;

async function assertRefused(env: NodeJS.ProcessEnv, dryRun: boolean) {
  await assert.rejects(
    () =>
      clearLocalBunqSecrets(
        { dryRun },
        {
          env,
          countRows: async () => {
            throw new Error("must not run");
          },
          clearRows: async () => {
            throw new Error("must not run");
          },
        },
      ),
    (error: unknown) => error instanceof LocalBunqSecretsRefusedError,
  );
}

describe("clearLocalBunqSecrets", () => {
  it("defaults to a dry-run that only counts", async () => {
    let cleared = 0;
    const result = await clearLocalBunqSecrets(
      {},
      {
        env: LOCAL_ENV,
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

  it("clears when dryRun is explicitly false on a positively-local env", async () => {
    const seen: Array<string | null> = [];
    const result = await clearLocalBunqSecrets(
      { dryRun: false, workspaceId: "w1" },
      {
        env: LOCAL_ENV,
        clearRows: async (workspaceId) => {
          seen.push(workspaceId);
          return 1;
        },
      },
    );
    assert.deepEqual(result, { dryRun: false, affectedRows: 1 });
    assert.deepEqual(seen, ["w1"]);
  });

  it("accepts localhost and IPv6 loopback hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      assert.equal(
        localBunqClearRefusalReason({
          CORE_REPLICATION_ROLE: " LOCAL ",
          DATABASE_URL: `postgresql://u:p@${host}:5433/db`,
        } as NodeJS.ProcessEnv),
        null,
        host,
      );
    }
  });

  it("refuses on a cloud core, even when not a dry-run", async () => {
    await assertRefused(
      { ...LOCAL_ENV, CORE_REPLICATION_ROLE: "cloud" } as NodeJS.ProcessEnv,
      false,
    );
  });

  it("refuses when CORE_REPLICATION_ROLE is unset or empty (unset is not enough)", async () => {
    await assertRefused({} as NodeJS.ProcessEnv, false);
    await assertRefused({} as NodeJS.ProcessEnv, true);
    await assertRefused(
      { DATABASE_URL: LOCAL_ENV.DATABASE_URL } as NodeJS.ProcessEnv,
      false,
    );
    await assertRefused(
      { ...LOCAL_ENV, CORE_REPLICATION_ROLE: "" } as NodeJS.ProcessEnv,
      false,
    );
  });

  it("refuses when DATABASE_URL is missing, unparseable or non-loopback", async () => {
    const base = { CORE_REPLICATION_ROLE: "local" };
    await assertRefused(base as NodeJS.ProcessEnv, false);
    await assertRefused(
      { ...base, DATABASE_URL: "not a url" } as NodeJS.ProcessEnv,
      false,
    );
    await assertRefused(
      {
        ...base,
        DATABASE_URL: "postgresql://u:p@postgres:5432/backsteros",
      } as NodeJS.ProcessEnv,
      false,
    );
    await assertRefused(
      {
        ...base,
        DATABASE_URL: "postgresql://u:p@100.83.125.67:5434/backsteros",
      } as NodeJS.ProcessEnv,
      true,
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
