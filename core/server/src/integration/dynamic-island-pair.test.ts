import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, isNull } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import { apiKeys, contacts } from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { DYNAMIC_ISLAND_API_KEY_NAME } from "../lib/dynamic-island-local-key-format.js";
import { resolveLocalShellOwner } from "../services/local-shell-auth.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const PAIR = "/api/v1/dynamic-island/pair";

test("OS-88 Dynamic Island pair is local-shell owner only and rotates one key", async (context) => {
  const app = createApp();
  const owner = await resolveLocalShellOwner();
  const mintedIds: string[] = [];
  const extraKeyIds: string[] = [];
  const extraContactIds: string[] = [];
  const previousRole = process.env.CORE_REPLICATION_ROLE;
  const logs: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  context.after(async () => {
    console.log = originalLog;
    console.warn = originalWarn;
    if (previousRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
    else process.env.CORE_REPLICATION_ROLE = previousRole;
    if (mintedIds.length > 0) {
      await db.delete(apiKeys).where(
        and(
          eq(apiKeys.workspaceId, owner.workspaceId),
          eq(apiKeys.name, DYNAMIC_ISLAND_API_KEY_NAME),
        ),
      );
    }
    for (const keyId of extraKeyIds) {
      await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    }
    for (const contactId of extraContactIds) {
      await db.delete(contacts).where(eq(contacts.id, contactId));
    }
    await sqlClient.end();
  });

  const unauth = await app.request(PAIR, { method: "POST" });
  assert.equal(unauth.status, 401);

  const first = await app.request(PAIR, {
    method: "POST",
    headers: { authorization: "Bearer local" },
  });
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as {
    secret: string;
    apiKey: { id: string; name: string; scopes: string[]; prefix: string };
  };
  mintedIds.push(firstBody.apiKey.id);
  assert.equal(firstBody.apiKey.name, DYNAMIC_ISLAND_API_KEY_NAME);
  assert.ok(firstBody.secret.startsWith("sk_live_"));
  assert.deepEqual([...firstBody.apiKey.scopes].sort(), [
    "projects:read",
    "tasks:read",
  ]);
  assert.equal(
    firstBody.apiKey.scopes.some((scope) => scope.includes("write")),
    false,
  );

  const second = await app.request(PAIR, {
    method: "POST",
    headers: { authorization: "Bearer local" },
  });
  assert.equal(second.status, 201);
  const secondBody = (await second.json()) as {
    secret: string;
    apiKey: { id: string; name: string; scopes: string[] };
  };
  mintedIds.push(secondBody.apiKey.id);
  assert.notEqual(secondBody.apiKey.id, firstBody.apiKey.id);
  assert.notEqual(secondBody.secret, firstBody.secret);

  const active = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.workspaceId, owner.workspaceId),
        eq(apiKeys.name, DYNAMIC_ISLAND_API_KEY_NAME),
        isNull(apiKeys.revokedAt),
      ),
    );
  assert.equal(active.length, 1);
  assert.equal(active[0]?.id, secondBody.apiKey.id);

  const listed = await app.request("/api/v1/api-keys", {
    headers: { authorization: "Bearer local" },
  });
  assert.equal(listed.status, 200);
  const listedText = await listed.text();
  assert.equal(listedText.includes(firstBody.secret), false);
  assert.equal(listedText.includes(secondBody.secret), false);
  assert.equal(listedText.includes('"secret"'), false);

  const ownerKeyId = id("key");
  const ownerSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  await db.insert(apiKeys).values({
    id: ownerKeyId,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    name: "os88-owner-full",
    prefix: apiKeyLookupPrefix(ownerSecret),
    keyHash: hashApiKey(ownerSecret),
    scopes: [...API_KEY_SCOPES],
    contactId: null,
  });
  extraKeyIds.push(ownerKeyId);

  const asOwnerKey = await app.request(PAIR, {
    method: "POST",
    headers: { authorization: `Bearer ${ownerSecret}` },
  });
  assert.equal(asOwnerKey.status, 401);

  const agentContactId = id("contact");
  extraContactIds.push(agentContactId);
  await db.insert(contacts).values({
    id: agentContactId,
    workspaceId: owner.workspaceId,
    key: id("agent"),
    name: "OS-88 Agent",
    firstName: "OS",
    lastName: "Agent",
  });
  const agentKeyId = id("key");
  const agentSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    name: "os88-agent",
    prefix: apiKeyLookupPrefix(agentSecret),
    keyHash: hashApiKey(agentSecret),
    scopes: [...API_KEY_SCOPES],
    contactId: agentContactId,
  });
  extraKeyIds.push(agentKeyId);

  const asAgent = await app.request(PAIR, {
    method: "POST",
    headers: { authorization: `Bearer ${agentSecret}` },
  });
  assert.equal(asAgent.status, 401);

  process.env.CORE_REPLICATION_ROLE = "cloud";
  const asCloud = await app.request(PAIR, {
    method: "POST",
    headers: { authorization: `Bearer ${ownerSecret}` },
  });
  assert.equal(asCloud.status, 404);
  if (previousRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
  else process.env.CORE_REPLICATION_ROLE = previousRole;

  const joinedLogs = logs.join("\n");
  assert.equal(joinedLogs.includes(firstBody.secret), false);
  assert.equal(joinedLogs.includes(secondBody.secret), false);
  assert.equal(joinedLogs.includes(ownerSecret), false);
  assert.equal(joinedLogs.includes(agentSecret), false);
});
