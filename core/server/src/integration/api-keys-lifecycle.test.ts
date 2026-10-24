import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

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
import { setSocketRemoteAddressOverrideForTests } from "../lib/request-address.js";
import { resetApiKeyLastUsedThrottleForTests } from "../services/api-keys.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const newSecret = () => `sk_live_${randomUUID().replaceAll("-", "")}`;

after(async () => {
  await sqlClient.end();
});

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

  // Last-used updates on successful auth (throttled — reset for test).
  // Spoofed x-forwarded-for must be ignored without a trusted proxy peer.
  context.after(() => {
    setSocketRemoteAddressOverrideForTests(undefined);
  });
  setSocketRemoteAddressOverrideForTests(null);
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
  assert.notEqual(agent.lastUsedAddress, "203.0.113.50");

  // Trusted peer: proxy headers are accepted (cf-connecting-ip wins).
  setSocketRemoteAddressOverrideForTests("127.0.0.1");
  resetApiKeyLastUsedThrottleForTests();
  const trustedProbe = await app.request("/api/v1/tasks", {
    headers: {
      authorization: `Bearer ${createdBody.secret}`,
      "cf-connecting-ip": "198.51.100.20",
      "x-real-ip": "198.51.100.21",
      "x-forwarded-for": "198.51.100.22, 10.0.0.1",
    },
  });
  assert.notEqual(trustedProbe.status, 401);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const listedTrusted = await app.request("/api/v1/api-keys", { headers: auth });
  const trustedBody = (await listedTrusted.json()) as {
    apiKeys: Array<{ id: string; lastUsedAddress: string | null }>;
  };
  const agentTrusted = trustedBody.apiKeys.find(
    (key) => key.id === createdBody.apiKey.id,
  );
  assert.ok(agentTrusted);
  assert.equal(agentTrusted.lastUsedAddress, "198.51.100.20");

  // Docker-style IPv4-mapped peer against plain TRUSTED_PROXY_IPS must also trust
  // cf-connecting-ip (regression guard for ::ffff:172.20.0.1).
  const previousTrustedProxies = process.env.TRUSTED_PROXY_IPS;
  process.env.TRUSTED_PROXY_IPS = "172.20.0.1";
  context.after(() => {
    if (previousTrustedProxies === undefined) {
      delete process.env.TRUSTED_PROXY_IPS;
    } else {
      process.env.TRUSTED_PROXY_IPS = previousTrustedProxies;
    }
  });
  setSocketRemoteAddressOverrideForTests("::ffff:172.20.0.1");
  resetApiKeyLastUsedThrottleForTests();
  const mappedProbe = await app.request("/api/v1/tasks", {
    headers: {
      authorization: `Bearer ${createdBody.secret}`,
      "cf-connecting-ip": "198.51.100.50",
    },
  });
  assert.notEqual(mappedProbe.status, 401);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const listedMapped = await app.request("/api/v1/api-keys", { headers: auth });
  const mappedBody = (await listedMapped.json()) as {
    apiKeys: Array<{ id: string; lastUsedAddress: string | null }>;
  };
  assert.equal(
    mappedBody.apiKeys.find((key) => key.id === createdBody.apiKey.id)
      ?.lastUsedAddress,
    "198.51.100.50",
  );

  // x-real-ip when cf-connecting-ip absent
  setSocketRemoteAddressOverrideForTests("127.0.0.1");
  resetApiKeyLastUsedThrottleForTests();
  await app.request("/api/v1/tasks", {
    headers: {
      authorization: `Bearer ${createdBody.secret}`,
      "x-real-ip": "198.51.100.30",
      "x-forwarded-for": "198.51.100.31",
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const listedRealIp = await app.request("/api/v1/api-keys", { headers: auth });
  const realIpBody = (await listedRealIp.json()) as {
    apiKeys: Array<{ id: string; lastUsedAddress: string | null }>;
  };
  assert.equal(
    realIpBody.apiKeys.find((key) => key.id === createdBody.apiKey.id)
      ?.lastUsedAddress,
    "198.51.100.30",
  );

  // x-forwarded-for first hop when only that header is present
  resetApiKeyLastUsedThrottleForTests();
  await app.request("/api/v1/tasks", {
    headers: {
      authorization: `Bearer ${createdBody.secret}`,
      "x-forwarded-for": "198.51.100.40, 10.0.0.1",
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const listedXff = await app.request("/api/v1/api-keys", { headers: auth });
  const xffBody = (await listedXff.json()) as {
    apiKeys: Array<{ id: string; lastUsedAddress: string | null }>;
  };
  assert.equal(
    xffBody.apiKeys.find((key) => key.id === createdBody.apiKey.id)
      ?.lastUsedAddress,
    "198.51.100.40",
  );
  setSocketRemoteAddressOverrideForTests(undefined);

  // Expiry change writes expiry_updated audit (and can revive later)
  const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const patchedExpiry = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(createdBody.apiKey.id)}`,
    {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ expiresAt: newExpiry }),
    },
  );
  assert.equal(patchedExpiry.status, 200);

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

  // Expired key is rejected for auth and for rotate
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

  const rotateExpired = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(expiredId)}/rotate`,
    { method: "POST", headers: auth },
  );
  assert.equal(rotateExpired.status, 400);

  // Revive via clearing expiry writes audit, then rotate is allowed
  const revive = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(expiredId)}`,
    {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ expiresAt: null }),
    },
  );
  assert.equal(revive.status, 200);
  const rotateAfterRevive = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(expiredId)}/rotate`,
    { method: "POST", headers: auth },
  );
  assert.equal(rotateAfterRevive.status, 200);

  // Revoke writes audit
  const revoked = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(createdBody.apiKey.id)}`,
    { method: "DELETE", headers: auth },
  );
  assert.equal(revoked.status, 204);

  const auditFinal = await app.request("/api/v1/api-keys/audit-logs?limit=40", {
    headers: auth,
  });
  const auditFinalBody = (await auditFinal.json()) as {
    auditLogs: Array<{ action: string; apiKeyName: string }>;
  };
  const actions = auditFinalBody.auditLogs
    .filter((entry) => entry.apiKeyName === "agent-key")
    .map((entry) => entry.action);
  assert.ok(actions.includes("created"));
  assert.ok(actions.includes("expiry_updated"));
  assert.ok(actions.includes("rotated"));
  assert.ok(actions.includes("revoked"));
  assert.ok(
    auditFinalBody.auditLogs.some(
      (entry) =>
        entry.apiKeyName === "expired-key" && entry.action === "expiry_updated",
    ),
  );
});

test("API keys: settings-write key cannot extend expiry beyond its own", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const ownerSecret = newSecret();
  const ownerKeyId = id("key");
  const actorExpiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  context.after(async () => {
    await db.delete(apiKeyAuditLogs).where(eq(apiKeyAuditLogs.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `owner-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "API keys expiry rights",
    slug: id("apikeys-exp"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: ownerKeyId,
    workspaceId,
    userId,
    name: "owner-expiring",
    prefix: apiKeyLookupPrefix(ownerSecret),
    keyHash: hashApiKey(ownerSecret),
    scopes: [...API_KEY_SCOPES],
    expiresAt: actorExpiresAt,
  });

  const auth = {
    authorization: `Bearer ${ownerSecret}`,
    "content-type": "application/json",
  };

  const tooFar = new Date(actorExpiresAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const created = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "child-key",
      scopes: ["tasks:read"],
      expiresAt: tooFar,
    }),
  });
  assert.equal(created.status, 400);

  const never = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "never-key",
      scopes: ["tasks:read"],
    }),
  });
  assert.equal(never.status, 400);

  const okExpiry = new Date(actorExpiresAt.getTime() - 60_000).toISOString();
  const ok = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "ok-key",
      scopes: ["tasks:read"],
      expiresAt: okExpiry,
    }),
  });
  assert.equal(ok.status, 201);
  const okBody = (await ok.json()) as { apiKey: { id: string } };

  const patchTooFar = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(okBody.apiKey.id)}`,
    {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ expiresAt: tooFar }),
    },
  );
  assert.equal(patchTooFar.status, 400);

  // Rotate of a never-expiring key must also be clamped (kept expiresAt outlives actor).
  const immortalId = id("key");
  const immortalSecret = newSecret();
  await db.insert(apiKeys).values({
    id: immortalId,
    workspaceId,
    userId,
    name: "immortal-key",
    prefix: apiKeyLookupPrefix(immortalSecret),
    keyHash: hashApiKey(immortalSecret),
    scopes: ["tasks:read"],
    expiresAt: null,
  });
  const rotateImmortal = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(immortalId)}/rotate`,
    { method: "POST", headers: auth },
  );
  assert.equal(rotateImmortal.status, 400);

  // Rotate of a key within the actor's expiry window is allowed.
  const rotateOk = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(okBody.apiKey.id)}/rotate`,
    { method: "POST", headers: auth },
  );
  assert.equal(rotateOk.status, 200);
});
