import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptBunqSecret,
  encryptBunqSecret,
  encryptBunqSecretPatch,
  isEncryptedBunqSecret,
} from "./bunq-secret-crypto.js";

const ENV = { BACKSTEROS_SECRET_ENCRYPTION_KEY: "unit-test-bunq-key" } as NodeJS.ProcessEnv;

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
