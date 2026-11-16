import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encryptBunqSecret } from "../lib/bunq-secret-crypto.js";
import {
  BunqReencryptRefusedError,
  bunqReencryptRefusalReason,
  cloudCoreHealthUrl,
  planBunqReencryptForRow,
  probeCloudCoreRunning,
  reencryptBunqSecretsToDedicatedKey,
} from "./bunq-secrets-reencrypt.js";

const DEDICATED = "dedicated-bunq-key-round6";
const OLD = "old-shared-replication-secret";

describe("bunqReencryptRefusalReason", () => {
  it("requires explicit cloud role", () => {
    assert.match(
      bunqReencryptRefusalReason({}) ?? "",
      /explicitly 'cloud'/,
    );
    assert.match(
      bunqReencryptRefusalReason({ CORE_REPLICATION_ROLE: "local" }) ?? "",
      /local/,
    );
    assert.equal(
      bunqReencryptRefusalReason({ CORE_REPLICATION_ROLE: "cloud" }),
      null,
    );
  });
});

describe("cloudCoreHealthUrl / probeCloudCoreRunning", () => {
  it("defaults to 127.0.0.1:8788/health", () => {
    assert.equal(cloudCoreHealthUrl({}), "http://127.0.0.1:8788/health");
    assert.equal(
      cloudCoreHealthUrl({ PORT: "9999", CORE_HEALTH_HOST: "10.0.0.1" }),
      "http://10.0.0.1:9999/health",
    );
  });

  it("is true only when health returns ok:true", async () => {
    assert.equal(
      await probeCloudCoreRunning({
        fetchFn: async () =>
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
      }),
      true,
    );
    assert.equal(
      await probeCloudCoreRunning({
        fetchFn: async () =>
          new Response(JSON.stringify({ ok: false }), { status: 200 }),
      }),
      false,
    );
    assert.equal(
      await probeCloudCoreRunning({
        fetchFn: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
      false,
    );
  });
});

describe("planBunqReencryptForRow", () => {
  const env = {
    BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
    CORE_REPLICATION_SECRET: OLD,
  };

  it("re-seals columns still under the old key", () => {
    const oldCipher = encryptBunqSecret("sandbox_api", {
      CORE_REPLICATION_SECRET: OLD,
    });
    const plan = planBunqReencryptForRow({ bunqApiKey: oldCipher }, env);
    assert.equal(Object.keys(plan.patch).length, 1);
    assert.ok(plan.patch.bunqApiKey);
    assert.notEqual(plan.patch.bunqApiKey, oldCipher);
    assert.equal(plan.expected.bunqApiKey, oldCipher);
    assert.deepEqual(plan.alreadyDedicated, []);
    assert.deepEqual(plan.failed, []);
    assert.deepEqual(plan.plaintextFields, []);
  });

  it("encrypts plaintext columns under the dedicated key", () => {
    const plan = planBunqReencryptForRow(
      {
        bunqApiKey: "sandbox_plaintext_key",
        bunqSigningPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\nplain\n-----END PRIVATE KEY-----",
      },
      env,
    );
    assert.equal(Object.keys(plan.patch).length, 2);
    assert.ok(plan.patch.bunqApiKey?.startsWith("v1:"));
    assert.ok(plan.patch.bunqSigningPrivateKeyPem?.startsWith("v1:"));
    assert.deepEqual(plan.plaintextFields.sort(), [
      "bunqApiKey",
      "bunqSigningPrivateKeyPem",
    ]);
    assert.equal(plan.expected.bunqApiKey, "sandbox_plaintext_key");
  });

  it("leaves columns already under the dedicated key alone", () => {
    const dedicatedCipher = encryptBunqSecret("sandbox_api", env);
    const plan = planBunqReencryptForRow(
      { bunqApiKey: dedicatedCipher },
      env,
    );
    assert.deepEqual(plan.patch, {});
    assert.deepEqual(plan.alreadyDedicated, ["bunqApiKey"]);
  });

  it("no-ops when the dedicated key is unset", () => {
    const oldCipher = encryptBunqSecret("x", { CORE_REPLICATION_SECRET: OLD });
    const plan = planBunqReencryptForRow(
      { bunqApiKey: oldCipher },
      { CORE_REPLICATION_SECRET: OLD },
    );
    assert.deepEqual(plan.patch, {});
  });
});

describe("reencryptBunqSecretsToDedicatedKey", () => {
  it("defaults to dry-run and refuses local", async () => {
    await assert.rejects(
      () =>
        reencryptBunqSecretsToDedicatedKey(
          { dryRun: false },
          { env: { CORE_REPLICATION_ROLE: "local" } },
        ),
      (error: unknown) => error instanceof BunqReencryptRefusedError,
    );
  });

  it("no-ops when the dedicated key is unset", async () => {
    const result = await reencryptBunqSecretsToDedicatedKey(
      {},
      {
        env: { CORE_REPLICATION_ROLE: "cloud" },
        loadRows: async () => {
          throw new Error("must not load");
        },
      },
    );
    assert.deepEqual(result, {
      dryRun: true,
      skippedNoKey: true,
      rows: 0,
      columns: 0,
      plaintextColumns: 0,
      alreadyDedicated: 0,
      casSkipped: 0,
      failedColumns: [],
    });
  });

  it("refuses --apply while the cloud core is responding", async () => {
    await assert.rejects(
      () =>
        reencryptBunqSecretsToDedicatedKey(
          { dryRun: false },
          {
            env: {
              CORE_REPLICATION_ROLE: "cloud",
              BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
            },
            probeCoreRunning: async () => true,
            loadRows: async () => {
              throw new Error("must not load");
            },
          },
        ),
      (error: unknown) =>
        error instanceof BunqReencryptRefusedError &&
        /cloud core is responding/.test(error.message),
    );
  });

  it("dry-run counts plaintext and ciphertext without writing; apply uses CAS", async () => {
    const oldCipher = encryptBunqSecret("sandbox_key", {
      CORE_REPLICATION_SECRET: OLD,
    });
    const env = {
      CORE_REPLICATION_ROLE: "cloud",
      BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
      CORE_REPLICATION_SECRET: OLD,
    };
    let applied = 0;
    const loadRows = async () => [
      {
        workspaceId: "ws1",
        bunqApiKey: oldCipher,
        bunqSigningPrivateKeyPem: "plaintext-pem",
        bunqSessionToken: null,
      },
    ];

    const dry = await reencryptBunqSecretsToDedicatedKey(
      {},
      {
        env,
        loadRows,
        applyPatch: async () => {
          applied += 1;
          return { written: 0, casSkipped: 0 };
        },
      },
    );
    assert.equal(dry.dryRun, true);
    assert.equal(dry.columns, 2);
    assert.equal(dry.plaintextColumns, 1);
    assert.equal(applied, 0);

    const written = await reencryptBunqSecretsToDedicatedKey(
      { dryRun: false },
      {
        env,
        loadRows,
        probeCoreRunning: async () => false,
        applyPatch: async (_id, patch, expected) => {
          applied += 1;
          assert.ok(patch.bunqApiKey);
          assert.ok(patch.bunqSigningPrivateKeyPem);
          assert.equal(expected.bunqApiKey, oldCipher);
          assert.equal(expected.bunqSigningPrivateKeyPem, "plaintext-pem");
          return { written: 2, casSkipped: 0 };
        },
      },
    );
    assert.equal(written.dryRun, false);
    assert.equal(written.columns, 2);
    assert.equal(written.plaintextColumns, 1);
    assert.equal(written.casSkipped, 0);
    assert.equal(applied, 1);
  });

  it("counts CAS skips when a concurrent write wins", async () => {
    const env = {
      CORE_REPLICATION_ROLE: "cloud",
      BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
    };
    const result = await reencryptBunqSecretsToDedicatedKey(
      { dryRun: false },
      {
        env,
        probeCoreRunning: async () => false,
        loadRows: async () => [
          { workspaceId: "ws1", bunqApiKey: "plain-key" },
        ],
        applyPatch: async () => ({ written: 0, casSkipped: 1 }),
      },
    );
    assert.equal(result.columns, 0);
    assert.equal(result.casSkipped, 1);
    assert.equal(result.plaintextColumns, 1);
  });
});
