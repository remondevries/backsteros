import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apiKeyLookupPrefix,
  generateApiKeySecret,
  hashApiKey,
} from "../lib/crypto.js";
import {
  guardCloudApiKeyApplyFromLocal,
  shouldSkipUnknownCloudApiKeyFromLocal,
} from "./core-replication/cloud-key-apply-guard.js";

/**
 * Behavioral contract for the local mirror / cloud→local round-trip (OS-181):
 * a cloud-minted plaintext secret must hash to the same key_hash the local
 * core would store, so auth works immediately after mirror and after sync.
 */
describe("api-key-admin local mirror hash contract (OS-181)", () => {
  it("hashes a cloud-minted secret the same way local auth does", () => {
    const secret = generateApiKeySecret();
    const keyHash = hashApiKey(secret);
    const prefix = apiKeyLookupPrefix(secret);
    assert.ok(keyHash.length > 20);
    assert.ok(prefix.startsWith("sk_"));
    assert.equal(hashApiKey(secret), keyHash);
    assert.notEqual(hashApiKey(`${secret}x`), keyHash);
  });

  it("round-trip: cloud-minted material authenticates locally; Mac cannot move workspace", () => {
    const secret = generateApiKeySecret();
    const cloudHash = hashApiKey(secret);
    // Local auth looks up by hash — same digest after mirror or after sync.
    assert.equal(hashApiKey(secret), cloudHash);

    // Cloud keeps its workspace_id when Mac tries to move the key.
    const guarded = guardCloudApiKeyApplyFromLocal(
      {
        name: "CLI",
        scopes: ["tasks:write"],
        expiresAt: null,
        revokedAt: null,
        userId: "owner",
        contactId: null,
        workspaceId: "ws-cloud",
      },
      {
        name: "CLI",
        scopes: ["tasks:write"],
        expiresAt: null,
        revokedAt: null,
        userId: "owner",
        contactId: null,
        workspaceId: "ws-mac-other",
      },
    );
    assert.equal(guarded.workspaceId, "ws-cloud");
    assert.deepEqual(guarded.ignoredFields, ["workspace_id"]);

    // Cloud still skips unknown Mac-only key ids (never mint from local).
    assert.equal(shouldSkipUnknownCloudApiKeyFromLocal(null), true);
  });
});
