import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptBunqSecret,
  encryptBunqSecret,
} from "../lib/bunq-secret-crypto.js";
import {
  BunqReencryptRefusedError,
  bunqReencryptRefusalReason,
  bunqReencryptScriptExitCode,
  cloudCoreHealthUrl,
  planBunqReencryptForRow,
  probeCloudCoreRunning,
  probeCloudCoreStatus,
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

describe("cloudCoreHealthUrl / probeCloudCoreStatus", () => {
  it("defaults to the compose service backsteros:8788/health", () => {
    assert.equal(cloudCoreHealthUrl({}), "http://backsteros:8788/health");
    assert.equal(
      cloudCoreHealthUrl({ PORT: "9999", CORE_HEALTH_HOST: "10.0.0.1" }),
      "http://10.0.0.1:9999/health",
    );
  });

  it("reports running when health returns ok:true", async () => {
    const result = await probeCloudCoreStatus({
      fetchFn: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    assert.equal(result.outcome, "running");
    assert.equal(await probeCloudCoreRunning({
      fetchFn: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    }), true);
  });

  it("reports stopped on connection refused", async () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
    });
    const result = await probeCloudCoreStatus({
      fetchFn: async () => {
        throw err;
      },
    });
    assert.equal(result.outcome, "stopped");
  });

  it("reports stopped on DNS not found errno", async () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND backsteros"), {
        code: "ENOTFOUND",
      }),
    });
    const result = await probeCloudCoreStatus({
      fetchFn: async () => {
        throw err;
      },
    });
    assert.equal(result.outcome, "stopped");
  });

  it("does not treat getaddrinfo message text alone as stopped (OS-178)", async () => {
    const err = new TypeError(
      "fetch failed: getaddrinfo EAI_AGAIN backsteros",
    );
    const result = await probeCloudCoreStatus({
      fetchFn: async () => {
        throw err;
      },
    });
    assert.equal(result.outcome, "uncertain");
  });

  it("reports uncertain on timeout", async () => {
    const err = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const result = await probeCloudCoreStatus({
      fetchFn: async () => {
        throw err;
      },
    });
    assert.equal(result.outcome, "uncertain");
  });

  it("reports uncertain on non-ok HTTP and ok:false", async () => {
    assert.equal(
      (
        await probeCloudCoreStatus({
          fetchFn: async () => new Response("nope", { status: 503 }),
        })
      ).outcome,
      "uncertain",
    );
    assert.equal(
      (
        await probeCloudCoreStatus({
          fetchFn: async () =>
            new Response(JSON.stringify({ ok: false }), { status: 200 }),
        })
      ).outcome,
      "uncertain",
    );
  });

  it("reports uncertain on other probe errors", async () => {
    const result = await probeCloudCoreStatus({
      fetchFn: async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }),
        });
      },
    });
    assert.equal(result.outcome, "uncertain");
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
        bunqSigningPrivateKeyPem:
          "-----BEGIN PRIVATE KEY-----\nplain\n-----END PRIVATE KEY-----",
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

  it("CAS-expects and seals newline-terminated PEM byte-identically", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n";
    assert.ok(pem.endsWith("\n"));
    const plan = planBunqReencryptForRow(
      { bunqSigningPrivateKeyPem: pem },
      env,
    );
    assert.equal(plan.expected.bunqSigningPrivateKeyPem, pem);
    assert.notEqual(plan.expected.bunqSigningPrivateKeyPem, pem.trim());
    const sealed = plan.patch.bunqSigningPrivateKeyPem!;
    assert.ok(sealed.startsWith("v1:"));
    assert.equal(decryptBunqSecret(sealed, env), pem);
  });

  it("CAS-expects and seals surrounding whitespace byte-identically", () => {
    const raw = "  sandbox_key_with_spaces  ";
    const plan = planBunqReencryptForRow({ bunqApiKey: raw }, env);
    assert.equal(plan.expected.bunqApiKey, raw);
    assert.equal(decryptBunqSecret(plan.patch.bunqApiKey!, env), raw);
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

describe("bunqReencryptScriptExitCode", () => {
  it("exits 0 when clean", () => {
    assert.equal(
      bunqReencryptScriptExitCode({ casSkipped: 0, failedColumns: [] }),
      0,
    );
  });

  it("exits 2 when casSkipped or failed", () => {
    assert.equal(
      bunqReencryptScriptExitCode({ casSkipped: 1, failedColumns: [] }),
      2,
    );
    assert.equal(
      bunqReencryptScriptExitCode({
        casSkipped: 0,
        failedColumns: [{ workspaceId: "ws", field: "bunqApiKey" }],
      }),
      2,
    );
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

  it("refuses --apply while the cloud core is running", async () => {
    await assert.rejects(
      () =>
        reencryptBunqSecretsToDedicatedKey(
          { dryRun: false },
          {
            env: {
              CORE_REPLICATION_ROLE: "cloud",
              BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
            },
            probeCoreStatus: async () => ({
              outcome: "running",
              detail: "ok",
            }),
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

  it("refuses --apply when the probe is uncertain", async () => {
    await assert.rejects(
      () =>
        reencryptBunqSecretsToDedicatedKey(
          { dryRun: false },
          {
            env: {
              CORE_REPLICATION_ROLE: "cloud",
              BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
            },
            probeCoreStatus: async () => ({
              outcome: "uncertain",
              detail: "timeout",
            }),
            loadRows: async () => {
              throw new Error("must not load");
            },
          },
        ),
      (error: unknown) =>
        error instanceof BunqReencryptRefusedError &&
        /uncertain/.test(error.message),
    );
  });

  it("skips the probe when confirmedCoreStopped is set", async () => {
    const result = await reencryptBunqSecretsToDedicatedKey(
      { dryRun: false, confirmedCoreStopped: true },
      {
        env: {
          CORE_REPLICATION_ROLE: "cloud",
          BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
        },
        probeCoreStatus: async () => {
          throw new Error("must not probe");
        },
        loadRows: async () => [],
      },
    );
    assert.equal(result.dryRun, false);
    assert.equal(result.rows, 0);
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
        probeCoreStatus: async () => ({
          outcome: "stopped",
          detail: "ECONNREFUSED",
        }),
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
    assert.equal(bunqReencryptScriptExitCode(written), 0);
  });

  it("counts CAS skips when a concurrent write wins and exits non-zero", async () => {
    const env = {
      CORE_REPLICATION_ROLE: "cloud",
      BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: DEDICATED,
    };
    const result = await reencryptBunqSecretsToDedicatedKey(
      { dryRun: false },
      {
        env,
        probeCoreStatus: async () => ({
          outcome: "stopped",
          detail: "ECONNREFUSED",
        }),
        loadRows: async () => [
          { workspaceId: "ws1", bunqApiKey: "plain-key" },
        ],
        applyPatch: async () => ({ written: 0, casSkipped: 1 }),
      },
    );
    assert.equal(result.columns, 0);
    assert.equal(result.casSkipped, 1);
    assert.equal(result.plaintextColumns, 1);
    assert.equal(bunqReencryptScriptExitCode(result), 2);
  });
});
