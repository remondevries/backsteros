import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { AGENT_API_KEY_SCOPES, API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  agents,
  apiKeys,
  chatThreadMessages,
  chatThreads,
  contacts,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { AGENT_CHAT_WEBHOOK_SECRET_HEADER } from "../lib/agent-chat-webhook.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY =
  process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim() ||
  "os150-integration-encryption-key";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const newSecret = (kind: "live" | "agent" = "live") =>
  kind === "agent"
    ? `sk_agent_${randomUUID().replaceAll("-", "")}`
    : `sk_live_${randomUUID().replaceAll("-", "")}`;

after(async () => {
  await sqlClient.end();
});

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await app.request(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  };
}

function assertNoSecretLeak(value: unknown, plaintext: string) {
  const raw = JSON.stringify(value);
  assert.equal(raw.includes(plaintext), false);
  assert.equal(raw.includes("webhookSecretCiphertext"), false);
  assert.equal(raw.includes("webhook_secret_ciphertext"), false);
  assert.equal(/"webhookSecret"\s*:/.test(raw), false);
}

test("OS-151/150 agents + chat loop: secret write-only, webhook fire, agent reply", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const ownerSecret = newSecret("live");
  const ownerKeyId = id("owner-key");
  const agentSecret = newSecret("agent");
  const agentKeyId = id("agent-key");
  const webhookPlain = `whsec_${randomUUID().replaceAll("-", "")}`;

  let webhookHit: {
    headers: IncomingMessage["headers"];
    body: string;
  } | null = null;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      webhookHit = {
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const webhookUrl = `http://127.0.0.1:${port}/sander`;

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db
      .delete(chatThreadMessages)
      .where(eq(chatThreadMessages.workspaceId, workspaceId));
    await db.delete(chatThreads).where(eq(chatThreads.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `agents-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Agents chat",
    slug: id("agents-chat"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    name: "Sander",
    firstName: "Sander",
    lastName: "",
    number: 1,
    key: id("sander"),
  });
  await db.insert(apiKeys).values({
    id: ownerKeyId,
    workspaceId,
    userId,
    name: "owner",
    prefix: apiKeyLookupPrefix(ownerSecret),
    keyHash: hashApiKey(ownerSecret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    name: "Sander",
    prefix: apiKeyLookupPrefix(agentSecret),
    keyHash: hashApiKey(agentSecret),
    scopes: [...AGENT_API_KEY_SCOPES],
    contactId,
  });

  // Create agent with webhook secret — response must never echo plaintext.
  const created = await json(app, "/api/v1/agents", ownerSecret, {
    method: "POST",
    body: JSON.stringify({
      name: "Sander",
      contactId,
      apiKeyId: agentKeyId,
      role: "Grok Bot agent",
      webhookUrl,
      webhookSecret: webhookPlain,
    }),
  });
  assert.equal(created.status, 201);
  assert.ok(created.body);
  assert.equal(created.body.webhookSecretConfigured, true);
  assert.equal(created.body.webhookUrl, webhookUrl);
  assertNoSecretLeak(created.body, webhookPlain);
  const agentId = String(created.body.id);

  const listed = await json(app, "/api/v1/agents", ownerSecret);
  assert.equal(listed.status, 200);
  assertNoSecretLeak(listed.body, webhookPlain);

  // Replace secret — still write-only.
  const patched = await json(app, `/api/v1/agents/${agentId}`, ownerSecret, {
    method: "PATCH",
    body: JSON.stringify({ webhookSecret: `${webhookPlain}_rotated` }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body?.webhookSecretConfigured, true);
  assertNoSecretLeak(patched.body, webhookPlain);
  assertNoSecretLeak(patched.body, `${webhookPlain}_rotated`);

  // Ciphertext lives only in DB.
  const [dbRow] = await db
    .select({
      ciphertext: agents.webhookSecretCiphertext,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  assert.ok(dbRow?.ciphertext?.startsWith("v1:"));
  assert.equal(dbRow.ciphertext.includes(`${webhookPlain}_rotated`), false);

  const open = await json(app, "/api/v1/chat/threads", ownerSecret, {
    method: "POST",
    body: JSON.stringify({ agentId }),
  });
  assert.equal(open.status, 200);
  const threadId = String(open.body?.id);

  // Missing webhook URL → clear inline error (store message, no thinking).
  await json(app, `/api/v1/agents/${agentId}`, ownerSecret, {
    method: "PATCH",
    body: JSON.stringify({ webhookUrl: "" }),
  });
  const noHook = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "hello without webhook" }),
    },
  );
  assert.equal(noHook.status, 201);
  assert.equal(noHook.body?.thinking, false);
  assert.match(String(noHook.body?.webhookError ?? ""), /No webhook URL/);

  // Restore webhook + fire.
  await json(app, `/api/v1/agents/${agentId}`, ownerSecret, {
    method: "PATCH",
    body: JSON.stringify({
      webhookUrl,
      webhookSecret: webhookPlain,
    }),
  });
  webhookHit = null;
  const sent = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "hello sander" }),
    },
  );
  assert.equal(sent.status, 201);
  assert.equal(sent.body?.thinking, true);
  assert.equal(sent.body?.webhookError, null);
  assert.ok(webhookHit);
  assert.equal(
    webhookHit.headers[AGENT_CHAT_WEBHOOK_SECRET_HEADER],
    webhookPlain,
  );
  const payload = JSON.parse(webhookHit.body) as {
    event: string;
    threadId: string;
    message: { text: string };
    context: unknown[];
  };
  assert.equal(payload.event, "agent.chat.message");
  assert.equal(payload.threadId, threadId);
  assert.equal(payload.message.text, "hello sander");
  assert.ok(payload.context.length >= 1);
  assert.equal(webhookHit.body.includes(webhookPlain), false);

  // Agent replies with its own API key.
  const reply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "Hey Remon — got it." }),
    },
  );
  assert.equal(reply.status, 201);
  assert.equal((reply.body?.message as { role?: string } | undefined)?.role, "assistant");
  assert.equal(reply.body?.thinking, false);

  const thread = await json(
    app,
    `/api/v1/chat/threads/${threadId}`,
    ownerSecret,
  );
  assert.equal(thread.status, 200);
  assert.equal(thread.body?.pendingReplyAt, null);
  const messages = thread.body?.messages as Array<{ role: string; body: string }>;
  assert.ok(messages.some((m) => m.role === "assistant" && m.body.includes("got it")));
});
