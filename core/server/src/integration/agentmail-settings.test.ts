import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES, updateAgentMailSettingsSchema } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db } from "../db/index.js";
import { apiKeys, users, workspaces } from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

test("updateAgentMailSettingsSchema accepts nanoid contact ids in inboxContacts", () => {
  const parsed = updateAgentMailSettingsSchema.safeParse({
    inboxContacts: { "inbox_abc123": "V1StGXR8_Z5jdHi6B-myT" },
  });
  assert.equal(parsed.success, true);
});

test("AgentMail settings PATCH stores API key", async (context) => {
  const app = createApp();
  const userId = `user-${randomUUID()}`;
  const workspaceId = `ws-${randomUUID()}`;
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;

  context.after(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: `clerk-${userId}`,
    email: "agentmail@test.com",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "AgentMail test",
    slug: `slug-${randomUUID()}`,
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: `key-${randomUUID()}`,
    workspaceId,
    userId,
    name: "settings",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });

  const response = await app.request("/api/v1/settings/agentmail", {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ apiKey: "am_test_key_12345" }),
  });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.apiKeyConfigured, true);
  assert.equal(typeof body.apiKeyPreview, "string");
});
