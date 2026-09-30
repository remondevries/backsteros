import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import { apiKeys, contacts, users, workspaces } from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const newSecret = () => `sk_live_${randomUUID().replaceAll("-", "")}`;

test("Settings API keys gate: owner keys pass, agent persona keys stay blocked", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const ownerEmail = `owner-${randomUUID()}@example.test`;
  const ownerContactId = id("contact");
  const agentContactId = id("contact");

  context.after(async () => {
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: ownerEmail,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "API keys gate",
    slug: id("apikeys"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values([
    {
      id: ownerContactId,
      workspaceId,
      key: id("owner"),
      name: "Owner Person",
      firstName: "Owner",
      lastName: "Person",
      email: ownerEmail.toUpperCase(),
    },
    {
      id: agentContactId,
      workspaceId,
      key: id("agent"),
      name: "Agent Persona",
      firstName: "Agent",
      lastName: "Persona",
    },
  ]);

  const keys = {
    unbound: { secret: newSecret(), contactId: null, scopes: [...API_KEY_SCOPES] },
    ownerContact: {
      secret: newSecret(),
      contactId: ownerContactId,
      scopes: [...API_KEY_SCOPES],
    },
    agentContact: {
      secret: newSecret(),
      contactId: agentContactId,
      scopes: [...API_KEY_SCOPES],
    },
    noSettingsWrite: {
      secret: newSecret(),
      contactId: ownerContactId,
      scopes: API_KEY_SCOPES.filter((scope) => scope !== "settings:write"),
    },
  };
  for (const [name, key] of Object.entries(keys)) {
    await db.insert(apiKeys).values({
      id: id("key"),
      workspaceId,
      userId,
      contactId: key.contactId,
      name,
      prefix: apiKeyLookupPrefix(key.secret),
      keyHash: hashApiKey(key.secret),
      scopes: key.scopes,
    });
  }

  const list = (secret: string) =>
    app.request("/api/v1/api-keys", {
      headers: { authorization: `Bearer ${secret}` },
    });

  const unbound = await list(keys.unbound.secret);
  assert.equal(unbound.status, 200);
  const body = (await unbound.json()) as { apiKeys: unknown[] };
  assert.equal(body.apiKeys.length, 4);

  assert.equal((await list(keys.ownerContact.secret)).status, 200);
  assert.equal((await list(keys.agentContact.secret)).status, 403);
  assert.equal((await list(keys.noSettingsWrite.secret)).status, 403);
});
