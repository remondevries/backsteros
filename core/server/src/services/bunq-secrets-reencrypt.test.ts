import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encryptBunqSecret } from "../lib/bunq-secret-crypto.js";
import {
  BunqReencryptRefusedError,
  bunqReencryptRefusalReason,
  planBunqReencryptForRow,
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
    assert.deepEqual(plan.alreadyDedicated, []);
    assert.deepEqual(plan.failed, []);
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
      alreadyDedicated: 0,
      failedColumns: [],
    });
  });

  it("dry-run counts without writing; apply writes the patch", async () => {
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
      { workspaceId: "ws1", bunqApiKey: oldCipher, bunqSessionToken: null },
    ];

    const dry = await reencryptBunqSecretsToDedicatedKey(
      {},
      { env, loadRows, applyPatch: async () => { applied += 1; } },
    );
    assert.equal(dry.dryRun, true);
    assert.equal(dry.columns, 1);
    assert.equal(applied, 0);

    const written = await reencryptBunqSecretsToDedicatedKey(
      { dryRun: false },
      {
        env,
        loadRows,
        applyPatch: async (_id, patch) => {
          applied += 1;
          assert.ok(patch.bunqApiKey);
          assert.notEqual(patch.bunqApiKey, oldCipher);
        },
      },
    );
    assert.equal(written.dryRun, false);
    assert.equal(written.columns, 1);
    assert.equal(applied, 1);
  });
});
