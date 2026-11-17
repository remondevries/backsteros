import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  keyAdminAuthHeaderRecord,
} from "../lib/api-key-admin-forward-auth.js";
import { authenticateKeyAdminForward } from "./api-key-admin-cloud.js";

const PREV = {
  role: process.env.CORE_REPLICATION_ROLE,
  peer: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
  admin: process.env.CORE_KEY_ADMIN_SECRET,
};

function restoreEnv() {
  for (const [key, value] of [
    ["CORE_REPLICATION_ROLE", PREV.role],
    ["CORE_REPLICATION_PEER_URL", PREV.peer],
    ["CORE_REPLICATION_SECRET", PREV.secret],
    ["CORE_KEY_ADMIN_SECRET", PREV.admin],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(restoreEnv);

describe("authenticateKeyAdminForward (OS-181)", () => {
  it("accepts CORE_KEY_ADMIN_SECRET + HMAC and rejects replication secret", () => {
    process.env.CORE_REPLICATION_ROLE = "cloud";
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8788";
    process.env.CORE_REPLICATION_SECRET = "repl-secret";
    process.env.CORE_KEY_ADMIN_SECRET = "admin-secret";
    const body = JSON.stringify({ name: "CLI" });
    const path = "/internal/core-replication/api-keys";
    const headers = keyAdminAuthHeaderRecord({
      secret: "admin-secret",
      method: "POST",
      path,
      userId: "owner-1",
      workspaceId: "ws-1",
      body,
      timestampMs: 1_700_000_000_000,
    });
    const headerMap = new Map(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const ok = authenticateKeyAdminForward({
      authorization: headers.Authorization,
      method: "POST",
      path,
      bodyText: body,
      headerGet: (name) => headerMap.get(name.toLowerCase()),
      nowMs: 1_700_000_000_000,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.userId, "owner-1");
      assert.equal(ok.workspaceId, "ws-1");
    }

    const rejected = authenticateKeyAdminForward({
      authorization: "Bearer repl-secret",
      method: "POST",
      path,
      bodyText: body,
      headerGet: (name) => headerMap.get(name.toLowerCase()),
      nowMs: 1_700_000_000_000,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.result.status, 403);
      assert.match(
        String((rejected.result.body as { error?: string }).error),
        /Replication secret cannot manage API keys/,
      );
    }
  });

  it("rejects agent-style credentials without key-admin HMAC", () => {
    process.env.CORE_REPLICATION_ROLE = "cloud";
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8788";
    process.env.CORE_REPLICATION_SECRET = "repl-secret";
    process.env.CORE_KEY_ADMIN_SECRET = "admin-secret";
    const rejected = authenticateKeyAdminForward({
      authorization: "Bearer sk_live_agent_key_not_admin",
      method: "POST",
      path: "/internal/core-replication/api-keys",
      bodyText: "{}",
      headerGet: () => null,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.result.status, 401);
    }
  });
});
