import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptBunqSecret,
  decryptBunqSecretFieldsForRollback,
  encryptBunqSecret,
  encryptBunqSecretPatch,
  isEncryptedBunqSecret,
} from "./bunq-secret-crypto.js";
import { decryptWebhookSecret } from "./auto-review-webhook.js";

const ENV = { BACKSTEROS_SECRET_ENCRYPTION_KEY: "unit-test-bunq-key" } as NodeJS.ProcessEnv;
const OLD = {
  BACKSTEROS_SECRET_ENCRYPTION_KEY: "old-shared-key",
  CORE_REPLICATION_SECRET: "old-replication-secret",
} as NodeJS.ProcessEnv;
const NEW = {
  ...OLD,
  BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: "dedicated-bunq-key",
} as NodeJS.ProcessEnv;
const DEDICATED_ONLY = {
  BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: "dedicated-bunq-key",
} as NodeJS.ProcessEnv;

describe("bunq secret crypto", () => {
  it("round-trips and never stores plaintext", () => {
    const stored = encryptBunqSecret("sandbox_abc123", ENV);
    assert.match(stored, /^v1:/);
    assert.equal(stored.includes("sandbox_abc123"), false);
    assert.equal(isEncryptedBunqSecret(stored), true);
    assert.equal(decryptBunqSecret(stored, ENV), "sandbox_abc123");
  });

  it("uses a fresh IV per encryption and is idempotent on ciphertext", () => {
    const a = encryptBunqSecret("same", ENV);
    const b = encryptBunqSecret("same", ENV);
    assert.notEqual(a, b);
    assert.equal(encryptBunqSecret(a, ENV), a);
  });

  it("reads legacy plaintext as-is and returns null for blank", () => {
    assert.equal(decryptBunqSecret("sandbox_legacy", ENV), "sandbox_legacy");
    assert.equal(decryptBunqSecret("  ", ENV), null);
    assert.equal(decryptBunqSecret(null, ENV), null);
  });

  it("treats a wrong key as not configured (never leaks ciphertext as secret)", () => {
    const stored = encryptBunqSecret("sandbox_abc", ENV);
    const other = { BACKSTEROS_SECRET_ENCRYPTION_KEY: "different-key" } as NodeJS.ProcessEnv;
    assert.equal(decryptBunqSecret(stored, other), null);
  });

  it("encrypts only present secret fields in a patch", () => {
    const patch = encryptBunqSecretPatch(
      {
        bunqApiKey: "sandbox_k",
        bunqSigningPrivateKeyPem: null,
        bunqSessionToken: "tok",
      },
      ENV,
    );
    assert.match(patch.bunqApiKey ?? "", /^v1:/);
    assert.equal(patch.bunqSigningPrivateKeyPem, null);
    assert.equal(decryptBunqSecret(patch.bunqSessionToken, ENV), "tok");
  });
});

describe("bunq dedicated key + fallback", () => {
  it("encrypts with the dedicated key when set (not readable via the shared keys alone)", () => {
    const stored = encryptBunqSecret("sandbox_new", NEW);
    assert.equal(decryptBunqSecret(stored, NEW), "sandbox_new");
    assert.equal(decryptBunqSecret(stored, DEDICATED_ONLY), "sandbox_new");
    // The shared auto-review key cannot read it: the bunq key is cloud-only.
    assert.equal(decryptBunqSecret(stored, OLD), null);
    assert.equal(decryptWebhookSecret(stored, NEW), null);
  });

  it("without a dedicated key, encrypts with BACKSTEROS_SECRET_ENCRYPTION_KEY then CORE_REPLICATION_SECRET", () => {
    const viaPrimary = encryptBunqSecret("a", OLD);
    assert.equal(
      decryptBunqSecret(viaPrimary, {
        BACKSTEROS_SECRET_ENCRYPTION_KEY: "old-shared-key",
      } as NodeJS.ProcessEnv),
      "a",
    );
    const viaReplication = encryptBunqSecret("b", {
      CORE_REPLICATION_SECRET: "old-replication-secret",
    } as NodeJS.ProcessEnv);
    assert.equal(decryptBunqSecret(viaReplication, OLD), "b");
  });

  it("decrypt falls back to BACKSTEROS_SECRET_ENCRYPTION_KEY then CORE_REPLICATION_SECRET", () => {
    const sealedPrimary = encryptBunqSecret("p", {
      BACKSTEROS_SECRET_ENCRYPTION_KEY: "old-shared-key",
    } as NodeJS.ProcessEnv);
    const sealedReplication = encryptBunqSecret("r", {
      CORE_REPLICATION_SECRET: "old-replication-secret",
    } as NodeJS.ProcessEnv);
    // Dedicated key is now configured, but old ciphertext stays readable.
    assert.equal(decryptBunqSecret(sealedPrimary, NEW), "p");
    assert.equal(decryptBunqSecret(sealedReplication, NEW), "r");
    // Unknown key everywhere → null.
    assert.equal(
      decryptBunqSecret(sealedPrimary, {
        BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY: "dedicated-bunq-key",
        BACKSTEROS_SECRET_ENCRYPTION_KEY: "nope",
        CORE_REPLICATION_SECRET: "nope-too",
      } as NodeJS.ProcessEnv),
      null,
    );
  });

  it("re-encrypts to the dedicated key on write (plaintext patch and old ciphertext)", () => {
    const oldCipher = encryptBunqSecret("sandbox_old", OLD);
    // Typical write path: decrypted plaintext goes back through the patch.
    const patch = encryptBunqSecretPatch(
      { bunqApiKey: decryptBunqSecret(oldCipher, NEW) as string },
      NEW,
    );
    assert.notEqual(patch.bunqApiKey, oldCipher);
    assert.equal(decryptBunqSecret(patch.bunqApiKey, DEDICATED_ONLY), "sandbox_old");

    // Old ciphertext passed straight through is rekeyed as well.
    const rekeyed = encryptBunqSecret(oldCipher, NEW);
    assert.notEqual(rekeyed, oldCipher);
    assert.equal(decryptBunqSecret(rekeyed, DEDICATED_ONLY), "sandbox_old");

    // Already under the dedicated key → unchanged (idempotent).
    assert.equal(encryptBunqSecret(rekeyed, NEW), rekeyed);

    // Without a dedicated key ciphertext is left alone.
    assert.equal(encryptBunqSecret(oldCipher, OLD), oldCipher);

    // Undecryptable ciphertext is not destroyed.
    const foreign = encryptBunqSecret("x", {
      BACKSTEROS_SECRET_ENCRYPTION_KEY: "someone-else",
    } as NodeJS.ProcessEnv);
    assert.equal(encryptBunqSecret(foreign, NEW), foreign);
  });
});

describe("decryptBunqSecretFieldsForRollback", () => {
  it("decrypts v1 fields back to plaintext, passes plaintext/null through, reports failures", () => {
    const apiKey = encryptBunqSecret("sandbox_key", NEW);
    const session = encryptBunqSecret("session", OLD);
    const foreign = encryptBunqSecret("x", {
      BACKSTEROS_SECRET_ENCRYPTION_KEY: "someone-else",
    } as NodeJS.ProcessEnv);
    const { patch, failed } = decryptBunqSecretFieldsForRollback(
      {
        bunqApiKey: apiKey,
        bunqSessionToken: session,
        bunqInstallationToken: foreign,
        bunqSigningPrivateKeyPem: "-----BEGIN PRIVATE KEY-----legacy",
      },
      NEW,
    );
    assert.deepEqual(patch, {
      bunqApiKey: "sandbox_key",
      bunqSessionToken: "session",
    });
    assert.deepEqual(failed, ["bunqInstallationToken"]);
  });

  it("returns an empty patch when nothing is encrypted", () => {
    assert.deepEqual(
      decryptBunqSecretFieldsForRollback({ bunqApiKey: "plain", bunqSessionToken: null }, NEW),
      { patch: {}, failed: [] },
    );
  });
});
