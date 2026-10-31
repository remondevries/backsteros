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
  assert.equal(typeof created.body.sortOrder, "number");

  const second = await json(app, "/api/v1/agents", ownerSecret, {
    method: "POST",
    body: JSON.stringify({
      name: "Jaap",
      role: "Second agent",
    }),
  });
  assert.equal(second.status, 201);
  const secondId = String(second.body?.id);
  assert.ok((second.body?.sortOrder as number) > (created.body.sortOrder as number));

  const reordered = await json(app, "/api/v1/agents/reorder", ownerSecret, {
    method: "PUT",
    body: JSON.stringify({ agentIds: [secondId, agentId] }),
  });
  assert.equal(reordered.status, 200);
  const reorderedAgents = (reordered.body?.agents as Array<{ id: string; sortOrder: number }>) ?? [];
  assert.equal(reorderedAgents[0]?.id, secondId);
  assert.equal(reorderedAgents[0]?.sortOrder, 0);
  assert.equal(reorderedAgents[1]?.id, agentId);
  assert.equal(reorderedAgents[1]?.sortOrder, 1);

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
  // Durable thinking is agent-status driven — webhook accept alone does not stick.
  assert.equal(
    (sent.body?.thread as { pendingReplyAt?: string | null } | undefined)
      ?.pendingReplyAt ?? null,
    null,
  );
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
  assert.equal(
    (payload as { replyUrl?: string }).replyUrl,
    `https://agent.backsteros.com/api/v1/chat/threads/${threadId}/messages`,
  );
  assert.equal(payload.message.text, "hello sander");
  assert.ok(payload.context.length >= 1);
  assert.equal(webhookHit.body.includes(webhookPlain), false);

  webhookHit = null;
  const tested = await json(
    app,
    `/api/v1/agents/${agentId}/webhook/test`,
    ownerSecret,
    { method: "POST", body: "{}" },
  );
  assert.equal(tested.status, 200);
  assert.equal(tested.body?.ok, true);
  assert.equal(tested.body?.threadId, threadId);
  assert.ok(typeof tested.body?.testId === "string");
  assert.ok(webhookHit);
  const testPayload = JSON.parse(webhookHit.body) as {
    event: string;
    testId: string;
    threadId: string;
    replyUrl: string;
    workspaceId: string;
    agentId: string;
  };
  assert.equal(testPayload.event, "agent.webhook.test");
  assert.equal(testPayload.testId, tested.body?.testId);
  assert.equal(testPayload.threadId, threadId);
  assert.equal(testPayload.workspaceId, workspaceId);
  assert.equal(testPayload.agentId, agentId);
  assert.equal(
    testPayload.replyUrl,
    `https://agent.backsteros.com/api/v1/chat/threads/${threadId}/messages`,
  );
  assert.equal(webhookHit.body.includes(webhookPlain), false);

  // Agent persona cannot subscribe to owner DM SSE.
  const agentSseDenied = await app.request("/api/v1/chat/threads/events", {
    headers: { authorization: `Bearer ${agentSecret}` },
  });
  assert.equal(agentSseDenied.status, 403);

  // Owner SSE should receive agent.chat.message when the agent replies.
  const sseResponse = await app.request("/api/v1/chat/threads/events", {
    headers: { authorization: `Bearer ${ownerSecret}` },
  });
  assert.equal(sseResponse.status, 200);
  assert.match(
    sseResponse.headers.get("content-type") ?? "",
    /text\/event-stream/,
  );
  assert.ok(sseResponse.body);
  const reader = sseResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const sseEvents: { event: string; data: string }[] = [];
  const readUntil = async (predicate: () => boolean, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), 250),
        ),
      ]);
      if (result.done && result.value === undefined) continue;
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const lines = chunk.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (data) sseEvents.push({ event, data });
      }
    }
  };
  await readUntil(() => sseEvents.some((e) => e.event === "ready"));

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

  await readUntil(
    () =>
      sseEvents.some((e) => e.event === "agent.chat.message") &&
      sseEvents.some(
        (e) =>
          e.event === "agent.chat.status" &&
          e.data.includes('"state":"idle"'),
      ),
  );
  const dmEvent = sseEvents.find((e) => e.event === "agent.chat.message");
  assert.ok(dmEvent);
  const dmPayload = JSON.parse(dmEvent.data) as {
    threadId: string;
    agentId: string;
    message: { id: string; body: string; fullBody: string; createdAt: string };
  };
  assert.equal(dmPayload.threadId, threadId);
  assert.equal(dmPayload.agentId, agentId);
  assert.ok(dmPayload.message.id);
  assert.match(dmPayload.message.body, /got it/i);
  assert.equal(dmPayload.message.fullBody, "Hey Remon — got it.");
  assert.ok(dmPayload.message.createdAt);

  // Owner cannot set agent status; agent can.
  const ownerStatusDenied = await json(
    app,
    `/api/v1/chat/threads/${threadId}/status`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ state: "working" }),
    },
  );
  assert.equal(ownerStatusDenied.status, 403);

  const working = await json(
    app,
    `/api/v1/chat/threads/${threadId}/status`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        state: "working",
        label: "  Searching inbox…  ",
      }),
    },
  );
  assert.equal(working.status, 200);
  assert.equal(working.body?.state, "working");
  assert.equal(working.body?.threadId, threadId);
  assert.equal(working.body?.agentId, agentId);
  assert.equal(working.body?.label, "Searching inbox…");
  assert.ok(typeof working.body?.pendingReplyAt === "string");

  await readUntil(() =>
    sseEvents.some(
      (e) =>
        e.event === "agent.chat.status" &&
        e.data.includes('"state":"working"') &&
        e.data.includes("Searching inbox"),
    ),
  );

  const workingRelabel = await json(
    app,
    `/api/v1/chat/threads/${threadId}/status`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({ state: "working", label: "Drafting reply" }),
    },
  );
  assert.equal(workingRelabel.status, 200);
  assert.equal(workingRelabel.body?.label, "Drafting reply");

  const idle = await json(
    app,
    `/api/v1/chat/threads/${threadId}/status`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({ state: "idle", label: "ignored" }),
    },
  );
  assert.equal(idle.status, 200);
  assert.equal(idle.body?.state, "idle");
  assert.equal(idle.body?.pendingReplyAt, null);
  assert.equal(idle.body?.label, null);

  void reader.cancel().catch(() => {});

  const thread = await json(
    app,
    `/api/v1/chat/threads/${threadId}`,
    ownerSecret,
  );
  assert.equal(thread.status, 200);
  assert.equal(thread.body?.pendingReplyAt, null);
  const messages = thread.body?.messages as Array<{
    id: string;
    role: string;
    body: string;
  }>;
  assert.ok(messages.some((m) => m.role === "assistant" && m.body.includes("got it")));

  const assistant = messages.find(
    (m) => m.role === "assistant" && m.body.includes("got it"),
  );
  assert.ok(assistant);

  // Agent posts a choices message; owner answers once (creates user msg + webhook).
  webhookHit = null;
  const choicesReply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Which path?",
        choices: {
          prompt: "Continue?",
          options: [
            { label: "Ship", value: "ship", style: "primary" },
            { label: "Hold", value: "hold" },
          ],
        },
      }),
    },
  );
  assert.equal(choicesReply.status, 201);
  const choicesMessage = choicesReply.body?.message as {
    id: string;
    choices?: { options: unknown[] };
    choicesAnswer: unknown;
  };
  assert.ok(choicesMessage?.choices?.options?.length === 2);
  assert.equal(choicesMessage.choicesAnswer, null);

  // User posts cannot attach choices.
  const userChoicesDenied = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "nope",
        choices: {
          options: [{ label: "A" }, { label: "B" }],
        },
      }),
    },
  );
  assert.equal(userChoicesDenied.status, 400);

  // Agent cannot answer.
  const agentAnswerDenied = await app.request(
    `/api/v1/chat/threads/${threadId}/messages/${choicesMessage.id}/answer`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: ["ship"] }),
    },
  );
  assert.equal(agentAnswerDenied.status, 403);

  webhookHit = null;
  const answered = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${choicesMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ values: ["ship"] }),
    },
  );
  assert.equal(answered.status, 201);
  assert.deepEqual(
    (answered.body?.message as { choicesAnswer?: { values: string[] } })
      ?.choicesAnswer?.values,
    ["ship"],
  );
  assert.equal(
    (answered.body?.reply as { message?: { body?: string } })?.message?.body,
    "ship",
  );
  assert.ok(webhookHit);
  const answerPayload = JSON.parse(webhookHit.body) as {
    message: { text: string };
  };
  assert.equal(answerPayload.message.text, "ship");

  const answeredAgain = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${choicesMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ values: ["hold"] }),
    },
  );
  assert.equal(answeredAgain.status, 409);

  // Agent posts an approval card; owner approves once (creates user msg + webhook).
  webhookHit = null;
  const approvalReply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Ready to ship?",
        approval: {
          title: "Deploy production",
          kind: "deploy",
          summary: "Ship commit abc123",
          fields: [
            { label: "Commit", value: "abc123" },
            { label: "Target", value: "production" },
          ],
          approveLabel: "Deploy",
        },
      }),
    },
  );
  assert.equal(approvalReply.status, 201);
  const approvalMessage = approvalReply.body?.message as {
    id: string;
    approval?: { title: string; kind: string };
    approvalAnswer: unknown;
  };
  assert.equal(approvalMessage?.approval?.title, "Deploy production");
  assert.equal(approvalMessage?.approval?.kind, "deploy");
  assert.equal(approvalMessage.approvalAnswer, null);

  // User posts cannot attach approval.
  const userApprovalDenied = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "nope",
        approval: {
          title: "Nope",
          summary: "Should fail",
        },
      }),
    },
  );
  assert.equal(userApprovalDenied.status, 400);

  // Agent cannot answer approval.
  const agentApprovalDenied = await app.request(
    `/api/v1/chat/threads/${threadId}/messages/${approvalMessage.id}/answer`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ decision: "approved" }),
    },
  );
  assert.equal(agentApprovalDenied.status, 403);

  webhookHit = null;
  const approved = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${approvalMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    },
  );
  assert.equal(approved.status, 201);
  assert.equal(
    (approved.body?.message as { approvalAnswer?: { decision: string } })
      ?.approvalAnswer?.decision,
    "approved",
  );
  assert.equal(
    (approved.body?.reply as { message?: { body?: string } })?.message?.body,
    "Approved: Deploy production",
  );
  assert.ok(webhookHit);
  const approvalPayload = JSON.parse(webhookHit.body) as {
    message: { text: string };
  };
  assert.equal(approvalPayload.message.text, "Approved: Deploy production");

  const approvedAgain = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${approvalMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ decision: "rejected", note: "too late" }),
    },
  );
  assert.equal(approvedAgain.status, 409);

  // Second approval → reject with note.
  const approval2 = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Pay invoice?",
        approval: {
          title: "Invoice INV-9",
          kind: "invoice",
          summary: "€500 to Acme",
          destructive: true,
        },
      }),
    },
  );
  assert.equal(approval2.status, 201);
  const approval2Id = (approval2.body?.message as { id: string }).id;
  const rejected = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${approval2Id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        decision: "rejected",
        note: "Wrong amount",
      }),
    },
  );
  assert.equal(rejected.status, 201);
  assert.equal(
    (rejected.body?.reply as { message?: { body?: string } })?.message?.body,
    "Rejected: Invoice INV-9 — Wrong amount",
  );

  // Agent posts a small form; owner submits once (creates user msg + webhook).
  webhookHit = null;
  const formReply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "A few details please.",
        form: {
          title: "Invoice details",
          description: "Fill these in.",
          submitLabel: "Send",
          fields: [
            {
              name: "amount",
              label: "Amount",
              type: "number",
              required: true,
              min: 0,
            },
            {
              name: "currency",
              label: "Currency",
              type: "select",
              required: true,
              options: [
                { label: "EUR", value: "EUR" },
                { label: "USD", value: "USD" },
              ],
            },
            { name: "rush", label: "Rush", type: "checkbox" },
          ],
        },
      }),
    },
  );
  assert.equal(formReply.status, 201);
  const formMessage = formReply.body?.message as {
    id: string;
    form?: { title: string };
    formAnswer: unknown;
  };
  assert.equal(formMessage?.form?.title, "Invoice details");
  assert.equal(formMessage.formAnswer, null);

  const userFormDenied = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "nope",
        form: {
          title: "Nope",
          fields: [{ name: "x", label: "X", type: "text" }],
        },
      }),
    },
  );
  assert.equal(userFormDenied.status, 400);

  const agentFormDenied = await app.request(
    `/api/v1/chat/threads/${threadId}/messages/${formMessage.id}/answer`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: { amount: 10, currency: "EUR" } }),
    },
  );
  assert.equal(agentFormDenied.status, 403);

  const formInvalid = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${formMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        values: { amount: -1, currency: "EUR" },
      }),
    },
  );
  assert.equal(formInvalid.status, 400);

  webhookHit = null;
  const formSubmitted = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${formMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        values: { amount: 1200, currency: "EUR", rush: true },
      }),
    },
  );
  assert.equal(formSubmitted.status, 201);
  assert.deepEqual(
    (formSubmitted.body?.message as { formAnswer?: { values: unknown } })
      ?.formAnswer?.values,
    { amount: 1200, currency: "EUR", rush: true },
  );
  assert.equal(
    (formSubmitted.body?.reply as { message?: { body?: string } })?.message
      ?.body,
    [
      "Submitted: Invoice details",
      "Amount: 1200",
      "Currency: EUR",
      "Rush: Yes",
    ].join("\n"),
  );
  assert.ok(webhookHit);
  const formPayload = JSON.parse(webhookHit.body) as {
    message: { text: string };
    context: Array<{ formAnswer?: { values: unknown } | null }>;
  };
  assert.match(formPayload.message.text, /^Submitted: Invoice details/);
  assert.ok(
    formPayload.context.some(
      (row) =>
        row.formAnswer &&
        (row.formAnswer.values as { amount?: number }).amount === 1200,
    ),
  );

  const formAgain = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${formMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ values: { amount: 1, currency: "USD" } }),
    },
  );
  assert.equal(formAgain.status, 409);

  // Agent keys cannot delete.
  const agentDeleteDenied = await app.request(
    `/api/v1/chat/threads/${threadId}/messages/${assistant.id}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${agentSecret}` },
    },
  );
  assert.equal(agentDeleteDenied.status, 403);

  // Owner soft-deletes one message.
  const deletedOne = await app.request(
    `/api/v1/chat/threads/${threadId}/messages/${assistant.id}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${ownerSecret}` },
    },
  );
  assert.equal(deletedOne.status, 204);

  const afterDelete = await json(
    app,
    `/api/v1/chat/threads/${threadId}`,
    ownerSecret,
  );
  assert.equal(afterDelete.status, 200);
  const remaining = afterDelete.body?.messages as Array<{ id: string }>;
  assert.equal(
    remaining.some((m) => m.id === assistant.id),
    false,
  );

  const listedThreads = await json(app, "/api/v1/chat/threads", ownerSecret);
  assert.equal(listedThreads.status, 200);
  const listRow = (
    listedThreads.body?.threads as Array<{
      id: string;
      lastAssistantMessage: { id: string } | null;
    }>
  )?.find((row) => row.id === threadId);
  assert.ok(listRow);
  assert.notEqual(listRow.lastAssistantMessage?.id, assistant.id);

  // Bulk delete remaining user message(s).
  const userMsg = remaining.find((m) => m.id !== assistant.id);
  if (userMsg) {
    const bulk = await json(
      app,
      `/api/v1/chat/threads/${threadId}/messages/delete`,
      ownerSecret,
      {
        method: "POST",
        body: JSON.stringify({ messageIds: [userMsg.id] }),
      },
    );
    assert.equal(bulk.status, 200);
    assert.ok(
      (bulk.body?.deletedIds as string[] | undefined)?.includes(userMsg.id),
    );
  }
});
