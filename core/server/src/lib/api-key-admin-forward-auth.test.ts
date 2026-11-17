import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  keyAdminAuthHeaderRecord,
  parseKeyAdminAuthHeaders,
  signKeyAdminRequest,
  verifyKeyAdminRequest,
} from "./api-key-admin-forward-auth.js";

const SECRET = "key-admin-test-secret";

describe("api-key-admin-forward-auth (OS-181)", () => {
  it("round-trips a valid signature", () => {
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
});
