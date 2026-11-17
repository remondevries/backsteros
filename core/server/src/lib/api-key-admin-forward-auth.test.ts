import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cloudApiKeyAdminPath,
  inspectCoreKeyAdminSecret,
  KEY_ADMIN_BEARER_MARKER,
  keyAdminAuthHeaderRecord,
  parseKeyAdminAuthHeaders,
  shouldWarnReplicationRoleUnset,
  signKeyAdminRequest,
  verifyKeyAdminRequest,
} from "./api-key-admin-forward-auth.js";

const SECRET = "key-admin-test-secret-32bytes!!!";

describe("api-key-admin-forward-auth (OS-181)", () => {
  it("round-trips a valid signature without sending the secret as bearer", () => {
    const input = {
      method: "POST",
      path: "/internal/core-replication/api-keys",
      userId: "user-1",
      workspaceId: "ws-1",
      timestampMs: 1_700_000_000_000,
      body: JSON.stringify({ name: "CLI" }),
    };
    const signature = signKeyAdminRequest(SECRET, input);
    const verified = verifyKeyAdminRequest({
      secret: SECRET,
      method: input.method,
      path: input.path,
      body: input.body,
      headers: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        timestampMs: input.timestampMs,
        signature,
      },
      nowMs: input.timestampMs,
    });
    assert.deepEqual(verified, { ok: true });

    const headers = keyAdminAuthHeaderRecord({
      secret: SECRET,
      method: input.method,
      path: input.path,
      userId: input.userId,
      workspaceId: input.workspaceId,
      body: input.body,
      timestampMs: input.timestampMs,
    });
    assert.equal(headers.Authorization, `Bearer ${KEY_ADMIN_BEARER_MARKER}`);
    assert.notEqual(headers.Authorization, `Bearer ${SECRET}`);
  });

  it("rejects bad signatures and skew", () => {
    const headers = parseKeyAdminAuthHeaders(
      keyAdminAuthHeaderRecord({
        secret: SECRET,
        method: "POST",
        path: "/internal/core-replication/api-keys",
        userId: "user-1",
        workspaceId: "ws-1",
        body: "{}",
        timestampMs: 1_700_000_000_000,
      }),
    );
    assert.ok(headers);
    assert.equal(
      verifyKeyAdminRequest({
        secret: SECRET,
        method: "POST",
        path: "/internal/core-replication/api-keys",
        body: "{}",
        headers: { ...headers, signature: "nope" },
        nowMs: 1_700_000_000_000,
      }).ok,
      false,
    );
    assert.equal(
      verifyKeyAdminRequest({
        secret: SECRET,
        method: "POST",
        path: "/internal/core-replication/api-keys",
        body: "{}",
        headers,
        nowMs: 1_700_000_000_000 + 10 * 60_000,
      }).ok,
      false,
    );
  });

  it("refuses short secrets and secrets equal to CORE_REPLICATION_SECRET", () => {
    assert.deepEqual(
      inspectCoreKeyAdminSecret({ CORE_KEY_ADMIN_SECRET: "short" }),
      { ok: false, reason: "too_short" },
    );
    assert.deepEqual(
      inspectCoreKeyAdminSecret({
        CORE_KEY_ADMIN_SECRET: SECRET,
        CORE_REPLICATION_SECRET: SECRET,
      }),
      { ok: false, reason: "equals_replication_secret" },
    );
    assert.equal(
      inspectCoreKeyAdminSecret({
        CORE_KEY_ADMIN_SECRET: SECRET,
        CORE_REPLICATION_SECRET: "other-replication-secret-value!!",
      }).ok,
      true,
    );
  });

  it("encodes key ids in cloud paths", () => {
    assert.equal(
      cloudApiKeyAdminPath("a/../b", "rotate"),
      "/internal/core-replication/api-keys/a%2F..%2Fb/rotate",
    );
  });

  it("warns when peer is set but ROLE is unset", () => {
    assert.equal(
      shouldWarnReplicationRoleUnset({
        CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8788",
      }),
      true,
    );
    assert.equal(
      shouldWarnReplicationRoleUnset({
        CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8788",
        CORE_REPLICATION_ROLE: "local",
      }),
      false,
    );
  });
});
