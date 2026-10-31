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
  projects,
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

test("project chat room: routes to lead, auth, no-lead notice", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const leadContactId = id("lead-contact");
  const otherContactId = id("other-contact");
  const ownerSecret = newSecret("live");
  const ownerKeyId = id("owner-key");
  const leadAgentSecret = newSecret("agent");
  const leadAgentKeyId = id("lead-key");
  const otherAgentSecret = newSecret("agent");
  const otherAgentKeyId = id("other-key");
  const webhookPlain = `whsec_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");

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
  const webhookUrl = `http://127.0.0.1:${port}/lead`;

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db
      .delete(chatThreadMessages)
      .where(eq(chatThreadMessages.workspaceId, workspaceId));
    await db.delete(chatThreads).where(eq(chatThreads.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `project-chat-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Project chat",
    slug: id("project-chat"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values([
    {
      id: leadContactId,
      workspaceId,
      name: "Niels",
      firstName: "Niels",
      lastName: "",
      title: "Lead engineer",
      number: 1,
      key: id("niels"),
    },
    {
      id: otherContactId,
      workspaceId,
      name: "Sander",
      firstName: "Sander",
      lastName: "",
      number: 2,
      key: id("sander"),
    },
  ]);
  await db.insert(apiKeys).values([
    {
      id: ownerKeyId,
      workspaceId,
      userId,
      name: "owner",
      prefix: apiKeyLookupPrefix(ownerSecret),
      keyHash: hashApiKey(ownerSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: leadAgentKeyId,
      workspaceId,
      name: "Niels",
      prefix: apiKeyLookupPrefix(leadAgentSecret),
      keyHash: hashApiKey(leadAgentSecret),
      scopes: [...AGENT_API_KEY_SCOPES],
      contactId: leadContactId,
    },
    {
      id: otherAgentKeyId,
      workspaceId,
      name: "Sander",
      prefix: apiKeyLookupPrefix(otherAgentSecret),
      keyHash: hashApiKey(otherAgentSecret),
      scopes: [...AGENT_API_KEY_SCOPES],
      contactId: otherContactId,
    },
  ]);

  const leadAgent = await json(app, "/api/v1/agents", ownerSecret, {
    method: "POST",
    body: JSON.stringify({
      name: "Niels",
      contactId: leadContactId,
      apiKeyId: leadAgentKeyId,
      role: "Lead",
      webhookUrl,
      webhookSecret: webhookPlain,
    }),
  });
  assert.equal(leadAgent.status, 201);
  const leadAgentId = String(leadAgent.body?.id);

  const otherAgent = await json(app, "/api/v1/agents", ownerSecret, {
    method: "POST",
    body: JSON.stringify({
      name: "Sander",
      contactId: otherContactId,
      apiKeyId: otherAgentKeyId,
      role: "Grok Bot",
      webhookUrl: `http://127.0.0.1:${port}/other`,
      webhookSecret: `whsec_other_${randomUUID().replaceAll("-", "")}`,
    }),
  });
  assert.equal(otherAgent.status, 201);

  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "OS",
    name: "BacksterOS",
    type: "codebase",
    leadAgentContactId: leadContactId,
    channel: { uri: "grokbot://app/v1/agent?id=proj", name: "BacksterOS" },
    channelStatus: "active",
  });

  const open = await json(app, "/api/v1/chat/threads", ownerSecret, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
  assert.equal(open.status, 200);
  assert.equal(open.body?.projectId, projectId);
  assert.equal(open.body?.agentId, leadAgentId);
  const threadId = String(open.body?.id);

  const reopen = await json(app, "/api/v1/chat/threads", ownerSecret, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body?.id, threadId);

  webhookHit = null;
  const sent = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "ship the project room" }),
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
    agentId: string;
    threadId: string;
    project?: {
      id: string;
      key: string;
      name: string;
      channel: { uri: string; name?: string | null } | null;
    };
  };
  assert.equal(payload.event, "agent.chat.message");
  assert.equal(payload.agentId, leadAgentId);
  assert.equal(payload.threadId, threadId);
  assert.equal(payload.project?.id, projectId);
  assert.equal(payload.project?.key, "OS");
  assert.equal(payload.project?.name, "BacksterOS");
  assert.equal(
    payload.project?.channel?.uri,
    "grokbot://app/v1/agent?id=proj",
  );

  const otherReply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    otherAgentSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "wrong agent" }),
    },
  );
  assert.equal(otherReply.status, 403);

  const otherStatus = await json(
    app,
    `/api/v1/chat/threads/${threadId}/status`,
    otherAgentSecret,
    {
      method: "POST",
      body: JSON.stringify({ state: "working", label: "Nope" }),
    },
  );
  assert.equal(otherStatus.status, 403);

  const leadStatus = await json(
    app,
    `/api/v1/chat/threads/${threadId}/status`,
    leadAgentSecret,
    {
      method: "POST",
      body: JSON.stringify({ state: "working", label: "On it" }),
    },
  );
  assert.equal(leadStatus.status, 200);
  assert.equal(leadStatus.body?.state, "working");

  const leadReply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    leadAgentSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "Working in the project room." }),
    },
  );
  assert.equal(leadReply.status, 201);
  assert.equal(
    (leadReply.body?.message as { role?: string } | undefined)?.role,
    "assistant",
  );

  // Clear lead → system notice instead of silent webhook miss.
  await db
    .update(projects)
    .set({ leadAgentContactId: null })
    .where(eq(projects.id, projectId));

  const noLead = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ body: "anyone there?" }),
    },
  );
  assert.equal(noLead.status, 201);
  assert.equal(noLead.body?.thinking, false);
  assert.match(String(noLead.body?.webhookError ?? ""), /No lead agent/i);

  const thread = await json(
    app,
    `/api/v1/chat/threads/${threadId}`,
    ownerSecret,
  );
  assert.equal(thread.status, 200);
  const messages =
    (thread.body?.messages as Array<{ role: string; body: string }>) ?? [];
  const system = messages.filter((message) => message.role === "system");
  assert.ok(system.some((message) => /No lead agent/i.test(message.body)));
});
