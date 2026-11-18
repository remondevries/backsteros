import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { emailThreads, users, workspaces } from "../db/schema.js";
import * as emailThreadsService from "../services/email-threads.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

test("OS-195: out-of-office does not bounce Waiting; real reply still retriages", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const waitingOooId = id("email");
  const waitingPollId = id("email");
  const waitingClientId = id("email");

  context.after(async () => {
    await db
      .delete(emailThreads)
      .where(eq(emailThreads.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os195@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-195",
    slug: id("os195"),
    ownerUserId: userId,
  });

  const tOld = new Date("2026-11-10T10:00:00.000Z");
  const tReply = new Date("2026-11-18T12:00:00.000Z");

  await db.insert(emailThreads).values([
    {
      id: waitingOooId,
      workspaceId,
      inboxId: "inbox_os195_webhook",
      threadKey: "thread_os195_webhook",
      number: 1951,
      status: "waiting",
      lastProcessedInboundMessageId: null,
      lastProcessedInboundAt: null,
      updatedAt: tOld,
    },
    {
      id: waitingPollId,
      workspaceId,
      inboxId: "inbox_os195_poll",
      threadKey: "thread_os195_poll",
      number: 1952,
      status: "waiting",
      lastProcessedInboundMessageId: null,
      lastProcessedInboundAt: null,
      updatedAt: tOld,
    },
    {
      id: waitingClientId,
      workspaceId,
      inboxId: "inbox_os195_client",
      threadKey: "thread_os195_client",
      number: 1953,
      status: "waiting",
      lastProcessedInboundMessageId: null,
      lastProcessedInboundAt: null,
      updatedAt: tOld,
    },
  ]);

  const oooHeaders = {
    "Auto-Submitted": "auto-replied",
    "X-Autoreply": "yes",
    Precedence: "bulk",
  };

  // Webhook path: OOO stays Waiting, cursor still advances.
  const webhookOoo = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os195_webhook",
    {
      threadId: "thread_os195_webhook",
      messageId: "msg_ooo_webhook",
      messageAt: tReply.toISOString(),
      from: "Client <client@pa-mu.test>",
      headers: oooHeaders,
      source: "event",
    },
  );
  assert.equal(webhookOoo?.status, "waiting");
  const afterWebhook = await emailThreadsService.getEmailThreadById(
    workspaceId,
    waitingOooId,
  );
  assert.equal(afterWebhook?.status, "waiting");
  assert.equal(afterWebhook?.lastProcessedInboundMessageId, "msg_ooo_webhook");

  // Poll path: OOO stays Waiting.
  const pollOoo = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os195_poll",
    {
      threadId: "thread_os195_poll",
      messageId: "msg_ooo_poll",
      messageAt: tReply.toISOString(),
      from: "Client <client@pa-mu.test>",
      headers: oooHeaders,
      source: "poll",
    },
  );
  assert.equal(pollOoo?.status, "waiting");
  const afterPoll = await emailThreadsService.getEmailThreadById(
    workspaceId,
    waitingPollId,
  );
  assert.equal(afterPoll?.status, "waiting");
  assert.equal(afterPoll?.lastProcessedInboundMessageId, "msg_ooo_poll");

  // Real client reply still retriages.
  const clientReply = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os195_client",
    {
      threadId: "thread_os195_client",
      messageId: "msg_client_reply",
      messageAt: tReply.toISOString(),
      from: "Client <client@pa-mu.test>",
      headers: { "Auto-Submitted": "no" },
      source: "event",
    },
  );
  assert.equal(clientReply?.status, "triage");
  const afterClient = await emailThreadsService.getEmailThreadById(
    workspaceId,
    waitingClientId,
  );
  assert.equal(afterClient?.status, "triage");
  assert.equal(afterClient?.lastProcessedInboundMessageId, "msg_client_reply");
});
