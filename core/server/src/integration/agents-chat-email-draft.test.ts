/**
 * Email draft cards — send path is mocked; never calls AgentMail.
 */
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
import { defaultChatEmailDraftDeps } from "../services/agent-chat-email-draft.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY =
  process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim() ||
  "os150-email-draft-encryption-key";

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

test("email draft card: mock send, discard, owner-only, one-shot 409", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const ownerSecret = newSecret("live");
  const ownerKeyId = id("owner-key");
  const agentSecret = newSecret("agent");
  const agentKeyId = id("agent-key");
  const webhookPlain = `whsec_${randomUUID().replaceAll("-", "")}`;

  let webhookHit: { body: string } | null = null;
  const webhookServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        webhookHit = { body: Buffer.concat(chunks).toString("utf8") };
        assert.equal(
          req.headers[AGENT_CHAT_WEBHOOK_SECRET_HEADER],
          webhookPlain,
        );
        res.writeHead(200);
        res.end("ok");
      });
    },
  );
  await new Promise<void>((resolve) =>
    webhookServer.listen(0, "127.0.0.1", resolve),
  );
  const webhookPort = (webhookServer.address() as AddressInfo).port;
  const webhookUrl = `http://127.0.0.1:${webhookPort}/hook`;

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      webhookServer.close((error) => (error ? reject(error) : resolve()));
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

  const original = { ...defaultChatEmailDraftDeps };
  let sendCalls = 0;
  let createCalls = 0;
  let deleteCalls = 0;
  defaultChatEmailDraftDeps.listInboxes = async () => [
    {
      inboxId: "inbox_test",
      email: "me@backsteros.test",
      displayName: "Remon",
    },
  ];
  defaultChatEmailDraftDeps.resolveDefaultInboxId = async () => "inbox_test";
  defaultChatEmailDraftDeps.resolveRecipient = async (_ws, ref) => {
    const email =
      typeof ref === "string"
        ? ref.includes("@")
          ? ref
          : "ada@example.com"
        : (ref.email ?? "ada@example.com");
    return {
      email: email.toLowerCase(),
      name: email.toLowerCase().startsWith("ada") ? "Ada" : null,
      contactId: email.toLowerCase().startsWith("ada") ? contactId : null,
    };
  };
  defaultChatEmailDraftDeps.loadAttachments = async () => [];
  defaultChatEmailDraftDeps.createMessagesDraft = async () => {
    createCalls += 1;
    return {
      draftId: `draft_mock_${createCalls}`,
      inboxId: "inbox_test",
      composeSessionId: `session_mock_${createCalls}`,
    };
  };
  defaultChatEmailDraftDeps.updateMessagesDraft = async (input) => ({
    draftId: input.draftId,
    inboxId: input.inboxId,
    composeSessionId: input.composeSessionId,
  });
  defaultChatEmailDraftDeps.deleteMessagesDraft = async () => {
    deleteCalls += 1;
  };
  defaultChatEmailDraftDeps.buildPreview = async (input) => ({
    greeting: "Hi Ada,",
    signOff: "Best,\nRemon",
    text: `Hi Ada,\n\n${input.body}\n\nBest,\nRemon`,
  });
  defaultChatEmailDraftDeps.sendEmail = async () => {
    sendCalls += 1;
    return { conversationId: "thread_mock_1", messageId: "msg_mock_1" };
  };
  context.after(() => {
    Object.assign(defaultChatEmailDraftDeps, original);
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `email-draft-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Email draft WS",
    slug: id("ed"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    name: "Ada",
    firstName: "Ada",
    lastName: "",
    email: "ada@example.com",
    number: 12,
    key: id("ada"),
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

  const created = await json(app, "/api/v1/agents", ownerSecret, {
    method: "POST",
    body: JSON.stringify({
      name: "Sander",
      contactId,
      apiKeyId: agentKeyId,
      webhookUrl,
      webhookSecret: webhookPlain,
    }),
  });
  assert.equal(created.status, 201);
  const agentId = String(created.body?.id);

  const threadRes = await json(app, "/api/v1/chat/threads", ownerSecret, {
    method: "POST",
    body: JSON.stringify({ agentId }),
  });
  assert.equal(threadRes.status, 200);
  const threadId = String(threadRes.body?.id);

  webhookHit = null;
  const draftReply = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Shall I send this?",
        emailDraft: {
          to: ["ada@example.com"],
          subject: "Invoice INV-9",
          // Body-only — no greeting/sign-off (server composes preview).
          body: "Please pay.",
          note: "Review before send",
        },
      }),
    },
  );
  assert.equal(draftReply.status, 201, JSON.stringify(draftReply.body));
  const draftMessage = draftReply.body?.message as {
    id: string;
    emailDraft?: {
      subject: string;
      to: Array<{ email: string }>;
      draftId: string;
      body: string;
      preview?: { greeting: string; signOff: string; text: string };
    };
    emailDraftResult: unknown;
  };
  assert.equal(draftMessage?.emailDraft?.subject, "Invoice INV-9");
  assert.equal(draftMessage?.emailDraft?.to?.[0]?.email, "ada@example.com");
  assert.equal(draftMessage?.emailDraft?.body, "Please pay.");
  assert.ok(draftMessage?.emailDraft?.draftId);
  assert.equal(draftMessage?.emailDraft?.preview?.greeting, "Hi Ada,");
  assert.match(draftMessage?.emailDraft?.preview?.text ?? "", /Please pay/);
  assert.equal(draftMessage.emailDraftResult, null);
  assert.equal(createCalls, 1);

  const userDenied = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "nope",
        emailDraft: {
          to: ["x@y.z"],
          subject: "Nope",
          body: "x",
        },
      }),
    },
  );
  assert.equal(userDenied.status, 400);

  const agentDenied = await app.request(
    `/api/v1/chat/threads/${threadId}/messages/${draftMessage.id}/answer`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ emailAction: "send" }),
    },
  );
  assert.equal(agentDenied.status, 403);
  assert.equal(sendCalls, 0);

  webhookHit = null;
  const sent = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${draftMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({
        emailAction: "send",
        edits: { subject: "Invoice INV-9 (final)" },
      }),
    },
  );
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sendCalls, 1);
  assert.equal(
    (sent.body?.message as { emailDraftResult?: { action: string } })
      ?.emailDraftResult?.action,
    "sent",
  );
  assert.equal(
    (sent.body?.reply as { message?: { body?: string } })?.message?.body,
    "Sent: Invoice INV-9 (final) to Ada",
  );
  assert.ok(webhookHit);
  assert.match(
    JSON.parse(webhookHit.body).message.text as string,
    /^Sent: Invoice INV-9 \(final\) to Ada/,
  );

  const again = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${draftMessage.id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ emailAction: "discard" }),
    },
  );
  assert.equal(again.status, 409);

  const draft2 = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages`,
    agentSecret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Another?",
        emailDraft: {
          to: ["ops@example.com"],
          subject: "Hold",
          body: "Never mind",
        },
      }),
    },
  );
  assert.equal(draft2.status, 201);
  const draft2Id = (draft2.body?.message as { id: string }).id;
  const beforeSend = sendCalls;
  const discarded = await json(
    app,
    `/api/v1/chat/threads/${threadId}/messages/${draft2Id}/answer`,
    ownerSecret,
    {
      method: "POST",
      body: JSON.stringify({ emailAction: "discard" }),
    },
  );
  assert.equal(discarded.status, 201);
  assert.equal(sendCalls, beforeSend);
  assert.equal(deleteCalls, 1);
  assert.equal(
    (discarded.body?.reply as { message?: { body?: string } })?.message?.body,
    "Discarded: Hold",
  );
});
