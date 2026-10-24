import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeyAuditLogs,
  apiKeys,
  users,
  workspaces,
} from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  hashApiKey,
} from "../lib/crypto.js";
import { resetApiKeyLastUsedThrottleForTests } from "../services/api-keys.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const newSecret = () => `sk_live_${randomUUID().replaceAll("-", "")}`;

test("API keys: expiry, last-used, rotate, and audit log", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const ownerSecret = newSecret();
  const ownerKeyId = id("key");

  context.after(async () => {
    await db.delete(apiKeyAuditLogs).where(eq(apiKeyAuditLogs.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `owner-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "API keys lifecycle",
    slug: id("apikeys-life"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: ownerKeyId,
    workspaceId,
    userId,
    name: "owner-manage",
    prefix: apiKeyLookupPrefix(ownerSecret),
    keyHash: hashApiKey(ownerSecret),
    scopes: [...API_KEY_SCOPES],
  });

  const auth = { authorization: `Bearer ${ownerSecret}` };

  // Create with expiry
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const created = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      name: "agent-key",
      scopes: ["tasks:read"],
      expiresAt,
    }),
  });
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as {
    apiKey: {
      id: string;
      expiresAt: string | null;
      lastUsedAt: string | null;
      prefix: string;
    };
    secret: string;
  };
  assert.ok(createdBody.secret.startsWith("sk_live_"));
  assert.equal(createdBody.apiKey.expiresAt, expiresAt);
  assert.equal(createdBody.apiKey.lastUsedAt, null);

  // Audit log has created
  const auditAfterCreate = await app.request(
    "/api/v1/api-keys/audit-logs?limit=10",
    { headers: auth },
  );
  assert.equal(auditAfterCreate.status, 200);
  const auditCreateBody = (await auditAfterCreate.json()) as {
    auditLogs: Array<{ action: string; apiKeyName: string }>;
  };
  assert.ok(
    auditCreateBody.auditLogs.some(
      (entry) => entry.action === "created" && entry.apiKeyName === "agent-key",
    ),
  );

  // Last-used updates on successful auth (throttled — reset for test)
  resetApiKeyLastUsedThrottleForTests();
  const probe = await app.request("/api/v1/api-keys", {
    headers: {
      authorization: `Bearer ${createdBody.secret}`,
      "x-forwarded-for": "203.0.113.50",
    },
  });
  // Agent key without settings:write may be 403, but auth still ran.
  assert.ok(probe.status === 200 || probe.status === 403);

  // Give the fire-and-forget touch a moment
  await new Promise((resolve) => setTimeout(resolve, 50));

  const listed = await app.request("/api/v1/api-keys", { headers: auth });
  assert.equal(listed.status, 200);
  const listBody = (await listed.json()) as {
    apiKeys: Array<{
      id: string;
      lastUsedAt: string | null;
      lastUsedAddress: string | null;
    }>;
  };
  const agent = listBody.apiKeys.find((key) => key.id === createdBody.apiKey.id);
  assert.ok(agent);
  assert.ok(agent.lastUsedAt);
  assert.equal(agent.lastUsedAddress, "203.0.113.50");

  // Rotate keeps id, changes secret
  const rotated = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(createdBody.apiKey.id)}/rotate`,
    { method: "POST", headers: auth },
  );
  assert.equal(rotated.status, 200);
  const rotatedBody = (await rotated.json()) as {
    apiKey: { id: string; prefix: string; lastUsedAt: string | null };
    secret: string;
  };
  assert.equal(rotatedBody.apiKey.id, createdBody.apiKey.id);
  assert.notEqual(rotatedBody.secret, createdBody.secret);
  assert.equal(rotatedBody.apiKey.lastUsedAt, null);

  const oldList = await app.request("/api/v1/api-keys", {
    headers: { authorization: `Bearer ${createdBody.secret}` },
  });
  assert.equal(oldList.status, 401);

  const newList = await app.request("/api/v1/tasks", {
    headers: { authorization: `Bearer ${rotatedBody.secret}` },
  });
  assert.notEqual(newList.status, 401);

  // Expired key is rejected
  const expiredSecret = newSecret();
  const expiredId = id("key");
  await db.insert(apiKeys).values({
    id: expiredId,
    workspaceId,
    userId,
    name: "expired-key",
    prefix: apiKeyLookupPrefix(expiredSecret),
    keyHash: hashApiKey(expiredSecret),
    scopes: ["tasks:read"],
    expiresAt: new Date(Date.now() - 60_000),
  });
  const expiredRes = await app.request("/api/v1/tasks", {
    headers: { authorization: `Bearer ${expiredSecret}` },
  });
  assert.equal(expiredRes.status, 401);

  // Revoke writes audit
  const revoked = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(createdBody.apiKey.id)}`,
    { method: "DELETE", headers: auth },
  );
  assert.equal(revoked.status, 204);

  const auditFinal = await app.request("/api/v1/api-keys/audit-logs?limit=20", {
    headers: auth,
  });
  const auditFinalBody = (await auditFinal.json()) as {
    auditLogs: Array<{ action: string; apiKeyName: string }>;
  };
  const actions = auditFinalBody.auditLogs
    .filter((entry) => entry.apiKeyName === "agent-key")
    .map((entry) => entry.action);
  assert.ok(actions.includes("created"));
  assert.ok(actions.includes("rotated"));
  assert.ok(actions.includes("revoked"));
});
