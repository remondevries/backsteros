import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

// routes → pending-unpushed-state → db; set before dynamic import.
process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { resetSyncEventPullRuntimeForTests } = await import("./config.js");
const { isLoopbackRemoteAddress, registerCoreReplicationRoutes } = await import(
  "./routes.js"
);

const SECRET = "os-82-sync-event-pull-control-secret";

const previous = {
  peerUrl: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
  role: process.env.CORE_REPLICATION_ROLE,
};

function restoreEnv() {
  if (previous.peerUrl === undefined) delete process.env.CORE_REPLICATION_PEER_URL;
  else process.env.CORE_REPLICATION_PEER_URL = previous.peerUrl;
  if (previous.secret === undefined) delete process.env.CORE_REPLICATION_SECRET;
  else process.env.CORE_REPLICATION_SECRET = previous.secret;
  if (previous.role === undefined) delete process.env.CORE_REPLICATION_ROLE;
  else process.env.CORE_REPLICATION_ROLE = previous.role;
  resetSyncEventPullRuntimeForTests();
}

afterEach(() => {
  restoreEnv();
});

describe("sync-event-pull control routes (OS-82)", () => {
  it("accepts only loopback remote addresses", () => {
    assert.equal(isLoopbackRemoteAddress("127.0.0.1"), true);
    assert.equal(isLoopbackRemoteAddress("::1"), true);
    assert.equal(isLoopbackRemoteAddress("::ffff:127.0.0.1"), true);
    assert.equal(isLoopbackRemoteAddress("10.0.0.2"), false);
    assert.equal(isLoopbackRemoteAddress(null), false);
  });

  it("rejects missing or wrong bearer (including agent API keys)", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = SECRET;
    process.env.CORE_REPLICATION_ROLE = "local";
    const app = new Hono();
    registerCoreReplicationRoutes(app);

    const missing = await app.request("/internal/core-replication/sync-event-pull");
    assert.equal(missing.status, 401);

    const wrong = await app.request("/internal/core-replication/sync-event-pull", {
      headers: { Authorization: "Bearer sk_live_not_the_replication_secret" },
    });
    assert.equal(wrong.status, 401);
  });

  it("returns 404 when role is cloud", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = SECRET;
    process.env.CORE_REPLICATION_ROLE = "cloud";
    const app = new Hono();
    registerCoreReplicationRoutes(app);

    const response = await app.request("/internal/core-replication/sync-event-pull", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "not_found");
  });

  it("returns 403 for non-loopback callers (app.request has no conninfo)", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = SECRET;
    process.env.CORE_REPLICATION_ROLE = "local";
    const app = new Hono();
    registerCoreReplicationRoutes(app);

    const response = await app.request("/internal/core-replication/sync-event-pull", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "forbidden");
  });
});
