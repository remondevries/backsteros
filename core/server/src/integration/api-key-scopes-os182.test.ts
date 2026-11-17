/**
 * OS-182: Access create persists requested scopes; rotate does not widen;
 * subset keys are refused on out-of-scope routes (local + cloud-forward).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { AGENT_API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { KEY_ADMIN_BEARER_MARKER } from "../lib/api-key-admin-forward-auth.js";
import { resolveLocalShellOwner } from "../services/local-shell-auth.js";

after(async () => {
  await sqlClient.end();
});

test("OS-182 local create/rotate: tasks:read only; 403 on projects; unknown scope 400", async (context) => {
  const app = createApp();
  const owner = await resolveLocalShellOwner();
  const previous = {
    role: process.env.CORE_REPLICATION_ROLE,
    peer: process.env.CORE_REPLICATION_PEER_URL,
    admin: process.env.CORE_KEY_ADMIN_SECRET,
  };
  // Pure-local path (no forward) — hybrid ROLE=local would reject non-shell actors.
  delete process.env.CORE_REPLICATION_ROLE;
  delete process.env.CORE_KEY_ADMIN_SECRET;
  const mintedIds: string[] = [];

  context.after(async () => {
    for (const [key, value] of [
      ["CORE_REPLICATION_ROLE", previous.role],
      ["CORE_REPLICATION_PEER_URL", previous.peer],
      ["CORE_KEY_ADMIN_SECRET", previous.admin],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const id of mintedIds) {
      await db.delete(apiKeys).where(eq(apiKeys.id, id));
    }
  });

  const shell = {
    authorization: "Bearer local",
    "content-type": "application/json",
  };

  const created = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: shell,
    body: JSON.stringify({
      name: `os182-tasks-read-${randomUUID().slice(0, 8)}`,
      kind: "access",
      scopes: ["tasks:read"],
    }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const createdBody = (await created.json()) as {
    apiKey: { id: string; scopes: string[] };
    secret: string;
  };
  mintedIds.push(createdBody.apiKey.id);
  assert.deepEqual(createdBody.apiKey.scopes, ["tasks:read"]);

  const [row] = await db
    .select({ scopes: apiKeys.scopes })
    .from(apiKeys)
    .where(eq(apiKeys.id, createdBody.apiKey.id))
    .limit(1);
  assert.deepEqual(row?.scopes, ["tasks:read"]);

  const tasksOk = await app.request("/api/v1/tasks?limit=1", {
    headers: { authorization: `Bearer ${createdBody.secret}` },
  });
  assert.notEqual(tasksOk.status, 401);
  assert.notEqual(tasksOk.status, 403);

  const projectsForbidden = await app.request("/api/v1/projects", {
    headers: { authorization: `Bearer ${createdBody.secret}` },
  });
  assert.equal(projectsForbidden.status, 403);

  const rotated = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(createdBody.apiKey.id)}/rotate`,
    { method: "POST", headers: { authorization: "Bearer local" } },
  );
  assert.equal(rotated.status, 200);
  const rotatedBody = (await rotated.json()) as {
    apiKey: { id: string; scopes: string[] };
    secret: string;
  };
  assert.equal(rotatedBody.apiKey.id, createdBody.apiKey.id);
  assert.deepEqual(rotatedBody.apiKey.scopes, ["tasks:read"]);
  assert.notEqual(rotatedBody.secret, createdBody.secret);

  const unknown = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: shell,
    body: JSON.stringify({
      name: "os182-unknown-scope",
      kind: "access",
      scopes: ["not-a-real-scope"],
    }),
  });
  assert.equal(unknown.status, 400);

  const empty = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: shell,
    body: JSON.stringify({
      name: "os182-empty-scopes",
      kind: "access",
      scopes: [],
    }),
  });
  assert.equal(empty.status, 400);

  const doorOnAccess = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: shell,
    body: JSON.stringify({
      name: "os182-door-on-access",
      kind: "access",
      scopes: ["tasks:read", "applications"],
    }),
  });
  assert.equal(doorOnAccess.status, 400);
});

test("OS-182 cloud-forward create persists requested scopes (not all)", async (context) => {
  const app = createApp();
  const owner = await resolveLocalShellOwner();
  const previous = {
    role: process.env.CORE_REPLICATION_ROLE,
    peer: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    admin: process.env.CORE_KEY_ADMIN_SECRET,
  };
  const ADMIN = "os182-admin-secret-32-bytes-ok!!";
  const REPL = "os182-repl-secret-not-the-admin!!";
  const originalFetch = globalThis.fetch;
  const cloudId = `os182-cloud-${randomUUID()}`;
  const cloudSecret = `sk_access_${randomUUID().replaceAll("-", "").slice(0, 24)}`;

  process.env.CORE_REPLICATION_ROLE = "local";
  process.env.CORE_REPLICATION_PEER_URL = "http://cloud.test:8788";
  process.env.CORE_REPLICATION_SECRET = REPL;
  process.env.CORE_KEY_ADMIN_SECRET = ADMIN;

  context.after(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["CORE_REPLICATION_ROLE", previous.role],
      ["CORE_REPLICATION_PEER_URL", previous.peer],
      ["CORE_REPLICATION_SECRET", previous.secret],
      ["CORE_KEY_ADMIN_SECRET", previous.admin],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.delete(apiKeys).where(eq(apiKeys.id, cloudId));
  });

  let forwardedBody: unknown;
  globalThis.fetch = (async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${KEY_ADMIN_BEARER_MARKER}`);
    forwardedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        apiKey: {
          id: cloudId,
          name: "os182-forward",
          prefix: cloudSecret.slice(0, 16),
          scopes: ["tasks:read"],
          contactId: null,
          createdAt: new Date().toISOString(),
          revokedAt: null,
          hasRecoverableSecret: true,
        },
        secret: cloudSecret,
      }),
      { status: 201 },
    );
  }) as typeof fetch;

  const created = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: {
      authorization: "Bearer local",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "os182-forward",
      kind: "access",
      scopes: ["tasks:read"],
    }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  assert.deepEqual(
    (forwardedBody as { scopes?: string[] }).scopes,
    ["tasks:read"],
  );
  const body = (await created.json()) as {
    apiKey: { id: string; scopes: string[] };
  };
  assert.equal(body.apiKey.id, cloudId);
  assert.deepEqual(body.apiKey.scopes, ["tasks:read"]);

  const [mirrored] = await db
    .select({ scopes: apiKeys.scopes, workspaceId: apiKeys.workspaceId })
    .from(apiKeys)
    .where(eq(apiKeys.id, cloudId))
    .limit(1);
  assert.equal(mirrored?.workspaceId, owner.workspaceId);
  assert.deepEqual(mirrored?.scopes, ["tasks:read"]);
  assert.ok(!AGENT_API_KEY_SCOPES.every((s) => mirrored?.scopes?.includes(s)));
});
