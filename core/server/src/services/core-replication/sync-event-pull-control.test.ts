import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, it } from "node:test";

import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";

// routes → pending-unpushed-state → db; set before dynamic import.
process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { resetSyncEventPullRuntimeForTests } = await import("./config.js");
const {
  resetLocalCoreControlTokenForTests,
  setLocalCoreControlTokenForTests,
} = await import("./local-core-control-token.js");
const { isLoopbackRemoteAddress, registerCoreReplicationRoutes } = await import(
  "./routes.js"
);

const REPLICATION_SECRET = "os-82-replication-secret-not-for-control";
const CONTROL_TOKEN = "os-82-local-control-token-aaaaaaaaaaaa";

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
  resetLocalCoreControlTokenForTests();
}

afterEach(() => {
  restoreEnv();
});

function appWithRoutes(): Hono {
  const app = new Hono();
  registerCoreReplicationRoutes(app);
  return app;
}

async function withLoopbackServer(
  app: Hono,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(getRequestListener(app.fetch));
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("expected TCP listen address");
  }
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("sync-event-pull control routes (OS-82)", () => {
  it("accepts only loopback remote addresses", () => {
    assert.equal(isLoopbackRemoteAddress("127.0.0.1"), true);
    assert.equal(isLoopbackRemoteAddress("::1"), true);
    assert.equal(isLoopbackRemoteAddress("::ffff:127.0.0.1"), true);
    assert.equal(isLoopbackRemoteAddress("10.0.0.2"), false);
    assert.equal(isLoopbackRemoteAddress(null), false);
  });

  it("rejects the replication secret and agent API keys (401)", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = REPLICATION_SECRET;
    process.env.CORE_REPLICATION_ROLE = "local";
    setLocalCoreControlTokenForTests(CONTROL_TOKEN);
    const app = appWithRoutes();

    const missing = await app.request("/internal/core-replication/sync-event-pull");
    assert.equal(missing.status, 401);

    const replication = await app.request(
      "/internal/core-replication/sync-event-pull",
      { headers: { Authorization: `Bearer ${REPLICATION_SECRET}` } },
    );
    assert.equal(replication.status, 401);

    const agent = await app.request("/internal/core-replication/sync-event-pull", {
      headers: { Authorization: "Bearer sk_live_not_the_control_token" },
    });
    assert.equal(agent.status, 401);
  });

  it("returns 404 when role is cloud even with the control token", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = REPLICATION_SECRET;
    process.env.CORE_REPLICATION_ROLE = "cloud";
    setLocalCoreControlTokenForTests(CONTROL_TOKEN);
    const app = appWithRoutes();

    const response = await app.request("/internal/core-replication/sync-event-pull", {
      headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "not_found");
  });

  it("accepts the control token from a real loopback caller", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = REPLICATION_SECRET;
    process.env.CORE_REPLICATION_ROLE = "local";
    setLocalCoreControlTokenForTests(CONTROL_TOKEN);
    const app = appWithRoutes();

    await withLoopbackServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/internal/core-replication/sync-event-pull`, {
        headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
      });
      // Auth + role + loopback pass; pending inspect may 500 without a live DB
      // schema in this unit harness — anything other than 401/403/404 means the
      // control token was accepted.
      assert.notEqual(response.status, 401);
      assert.notEqual(response.status, 403);
      assert.notEqual(response.status, 404);
    });
  });
});
