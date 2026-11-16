import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { AGENT_KEY_SCOPES, API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  agents,
  apiKeyAuditLogs,
  apiKeys,
  contacts,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY =
  process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim() ||
  "c1-integration-encryption-key";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

test("C1: Access keys cannot reveal or rotate agent / payment-agent keys", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const ownerKeyId = id("owner-key");
  const agentKeyId = id("agent-key");
  const paymentKeyId = id("payment-key");
  const paymentAgentId = id("payment-agent");
  const ownerSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const agentSecret = `sk_agent_${randomUUID().replaceAll("-", "")}`;
  const paymentSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = paymentAgentId;

  context.after(async () => {
    delete process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID;
    await db.delete(apiKeyAuditLogs).where(eq(apiKeyAuditLogs.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
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
    name: "agent secret guard",
    slug: id("agent-secret"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    key: id("c"),
    name: "Agent",
    firstName: "Agent",
    lastName: "",
  });
  await db.insert(apiKeys).values([
    {
      id: ownerKeyId,
      workspaceId,
      userId,
      name: "owner-manage",
      prefix: apiKeyLookupPrefix(ownerSecret),
      keyHash: hashApiKey(ownerSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: agentKeyId,
      workspaceId,
      userId: null,
      contactId,
      name: "agent",
      prefix: apiKeyLookupPrefix(agentSecret),
      keyHash: hashApiKey(agentSecret),
      scopes: [...AGENT_KEY_SCOPES],
    },
    {
      // Not contact-bound, but wired to the payment-proposal agent.
      id: paymentKeyId,
      workspaceId,
      userId: null,
      name: "payment-agent-key",
      prefix: apiKeyLookupPrefix(paymentSecret),
      keyHash: hashApiKey(paymentSecret),
      scopes: [...AGENT_KEY_SCOPES],
    },
  ]);
  await db.insert(agents).values({
    id: paymentAgentId,
    workspaceId,
    contactId,
    apiKeyId: paymentKeyId,
    name: "Ralph",
    enabled: true,
  });

  const auth = { authorization: `Bearer ${ownerSecret}` };
  for (const keyId of [agentKeyId, paymentKeyId]) {
    const reveal = await app.request(
      `/api/v1/api-keys/${encodeURIComponent(keyId)}/secret`,
      { headers: auth },
    );
    assert.equal(reveal.status, 403, `reveal ${keyId}`);
    const rotate = await app.request(
      `/api/v1/api-keys/${encodeURIComponent(keyId)}/rotate`,
      { method: "POST", headers: auth },
    );
    assert.equal(rotate.status, 403, `rotate ${keyId}`);
  }

  // Hash must be untouched after the refused rotate.
  const [still] = await db
    .select({ keyHash: apiKeys.keyHash })
    .from(apiKeys)
    .where(eq(apiKeys.id, agentKeyId))
    .limit(1);
  assert.equal(still?.keyHash, hashApiKey(agentSecret));
});
