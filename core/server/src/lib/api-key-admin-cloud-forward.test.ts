import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
  ApiKeyAdminCloudForwardError,
  forwardApiKeyAdminToCloud,
  shouldForwardApiKeyAdminToCloud,
} from "./api-key-admin-cloud-forward.js";
import { KEY_ADMIN_BEARER_MARKER } from "./api-key-admin-forward-auth.js";

const ADMIN = "admin-secret-at-least-32-bytes!!";

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

describe("api-key-admin-cloud-forward (OS-181)", () => {
  it("only forwards when role=local", () => {
    process.env.CORE_REPLICATION_ROLE = "cloud";
    assert.equal(shouldForwardApiKeyAdminToCloud(), false);
    process.env.CORE_REPLICATION_ROLE = "local";
    assert.equal(shouldForwardApiKeyAdminToCloud(), true);
  });

  it("fails closed when CORE_KEY_ADMIN_SECRET is missing", async () => {
    process.env.CORE_REPLICATION_ROLE = "local";
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = "repl-secret";
    delete process.env.CORE_KEY_ADMIN_SECRET;
    await assert.rejects(
      () =>
        forwardApiKeyAdminToCloud({
          method: "POST",
          path: "/internal/core-replication/api-keys",
          userId: "u1",
          workspaceId: "ws1",
          body: { name: "x" },
          fetchImpl: async () => {
            throw new Error("must not fetch");
          },
        }),
      (error: unknown) =>
        error instanceof ApiKeyAdminCloudForwardError &&
        error.code === "api_key_admin_secret_missing" &&
        error.message === API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
    );
  });

  it("fails closed when the cloud is down", async () => {
    process.env.CORE_REPLICATION_ROLE = "local";
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = "repl-secret-not-admin-value!!!!!";
    process.env.CORE_KEY_ADMIN_SECRET = ADMIN;
    await assert.rejects(
      () =>
        forwardApiKeyAdminToCloud({
          method: "POST",
          path: "/internal/core-replication/api-keys",
          userId: "u1",
          workspaceId: "ws1",
          body: {},
          fetchImpl: async () => {
            throw new TypeError("fetch failed");
          },
        }),
      (error: unknown) =>
        error instanceof ApiKeyAdminCloudForwardError &&
        error.status === 502,
    );
  });

  it("forwards successfully with key-admin marker (not the secret)", async () => {
    process.env.CORE_REPLICATION_ROLE = "local";
    process.env.CORE_REPLICATION_PEER_URL = "http://cloud.test:8788";
    process.env.CORE_REPLICATION_SECRET = "repl-secret-not-admin-value!!!!!";
    process.env.CORE_KEY_ADMIN_SECRET = ADMIN;
    let sawAuth = "";
    const result = await forwardApiKeyAdminToCloud({
      method: "POST",
      path: "/internal/core-replication/api-keys",
      userId: "u1",
      workspaceId: "ws1",
      body: { name: "CLI", kind: "access", scopes: ["tasks:write"] },
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        sawAuth = headers.get("Authorization") ?? "";
        assert.equal(sawAuth, `Bearer ${KEY_ADMIN_BEARER_MARKER}`);
        assert.ok(headers.get("x-backsteros-key-admin-signature"));
        return new Response(
          JSON.stringify({
            apiKey: { id: "k1", workspaceId: "ws1", name: "CLI", scopes: [] },
            secret: "sk_live_test",
          }),
          { status: 201 },
        );
      },
    });
    assert.equal(result.status, 201);
    assert.equal(
      (result.body as { secret?: string }).secret,
      "sk_live_test",
    );
  });
});
