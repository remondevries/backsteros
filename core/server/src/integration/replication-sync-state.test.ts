/**
 * Real HTTP request against the registered /sync-state handler (auth + tips).
 * Uses backsteros_test via the normal integration DATABASE_URL.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { Hono } from "hono";

import { sqlClient } from "../db/index.js";
import { registerCoreReplicationRoutes } from "../services/core-replication/routes.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const SECRET = "integration-sync-state-secret";
const previous = {
  peerUrl: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
  role: process.env.CORE_REPLICATION_ROLE,
};

process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
process.env.CORE_REPLICATION_SECRET = SECRET;
process.env.CORE_REPLICATION_ROLE = "cloud";

after(async () => {
  if (previous.peerUrl === undefined) delete process.env.CORE_REPLICATION_PEER_URL;
  else process.env.CORE_REPLICATION_PEER_URL = previous.peerUrl;
  if (previous.secret === undefined) delete process.env.CORE_REPLICATION_SECRET;
  else process.env.CORE_REPLICATION_SECRET = previous.secret;
  if (previous.role === undefined) delete process.env.CORE_REPLICATION_ROLE;
  else process.env.CORE_REPLICATION_ROLE = previous.role;
  await sqlClient.end();
});

test("GET /internal/core-replication/sync-state returns tips with auth", async () => {
  const app = new Hono();
  registerCoreReplicationRoutes(app);

  const unauthorized = await app.request(
    "/internal/core-replication/sync-state",
  );
  assert.equal(unauthorized.status, 401);

  const response = await app.request("/internal/core-replication/sync-state", {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    tips: Array<{ table: string; tip: { updatedAt: string; rowId: string } | null }>;
  };
  assert.ok(Array.isArray(body.tips));
  assert.ok(body.tips.length > 0);
  assert.ok(body.tips.every((entry) => typeof entry.table === "string"));
  // Tip timestamps from ::text must keep fractional seconds when present.
  for (const entry of body.tips) {
    if (!entry.tip) continue;
    assert.match(entry.tip.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(typeof entry.tip.rowId === "string");
  }
});
