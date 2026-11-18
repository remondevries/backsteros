import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { emailThreads, users, workspaces } from "../db/schema.js";
import * as emailThreadsService from "../services/email-threads.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

test("OS-188: time-based inbound cursor — poll/webhook races, empty cursor, list lag, sent skip", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const emptyWaitingId = id("email");
  const raceId = id("email");
  const lagId = id("email");
  const sentId = id("email");
  const seededWaitingId = id("email");

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
    email: "os188@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-188",
    slug: id("os188"),
    ownerUserId: userId,
  });

  const tOld = new Date("2026-11-10T10:00:00.000Z");
  const tReply = new Date("2026-11-18T09:46:00.000Z");
  const tWebhook = new Date("2026-11-18T09:50:00.000Z");
  const tLag = new Date("2026-11-18T09:40:00.000Z");

  await db.insert(emailThreads).values([
    {
      id: emptyWaitingId,
      workspaceId,
      inboxId: "inbox_os188_empty",
      threadKey: "thread_os188_empty",
      number: 1881,
      status: "waiting",
      lastProcessedInboundMessageId: null,
      lastProcessedInboundAt: null,
    },
    {
      id: raceId,
      workspaceId,
      inboxId: "inbox_os188_race",
      threadKey: "thread_os188_race",
      number: 1882,
      status: "ready_to_start",
      lastProcessedInboundMessageId: null,
      lastProcessedInboundAt: tOld,
    },
    {
      id: lagId,
      workspaceId,
      inboxId: "inbox_os188_lag",
      threadKey: "thread_os188_lag",
      number: 1883,
      status: "waiting",
      lastProcessedInboundMessageId: "msg_webhook_new",
      lastProcessedInboundAt: tWebhook,
    },
    {
      id: sentId,
      workspaceId,
      inboxId: "inbox_os188_sent",
      threadKey: "thread_os188_sent",
      number: 1884,
      status: "waiting",
      lastProcessedInboundMessageId: null,
      lastProcessedInboundAt: null,
    },
    {
      id: seededWaitingId,
      workspaceId,
      inboxId: "inbox_os188_seeded",
      threadKey: "thread_os188_seeded",
      number: 1885,
      status: "waiting",
      lastProcessedInboundMessageId: null,
      // Migration-style seed: older inbound must not bounce Waiting.
      lastProcessedInboundAt: tReply,
    },
  ]);

  // Empty cursor Waiting thread + real reply → retriages (no poll seed-only swallow).
  const emptyMoved = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_empty",
    {
      threadId: "thread_os188_empty",
      messageId: "msg_real_reply",
      messageAt: tReply.toISOString(),
      source: "poll",
    },
  );
  assert.equal(emptyMoved?.status, "triage");
  const afterEmpty = await emailThreadsService.getEmailThreadById(
    workspaceId,
    emptyWaitingId,
  );
  assert.equal(afterEmpty?.status, "triage");
  assert.equal(afterEmpty?.lastProcessedInboundMessageId, "msg_real_reply");

  // Poll-then-webhook race: poll handles the reply; webhook for same id no-ops.
  const pollRace = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_race",
    {
      threadId: "thread_os188_race",
      messageId: "msg_race_1",
      messageAt: tReply.toISOString(),
      source: "poll",
    },
  );
  assert.equal(pollRace?.status, "triage");
  await db
    .update(emailThreads)
    .set({ status: "waiting" })
    .where(eq(emailThreads.id, raceId));

  const webhookRace = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_race",
    {
      threadId: "thread_os188_race",
      messageId: "msg_race_1",
      messageAt: tReply.toISOString(),
      source: "event",
    },
  );
  assert.equal(webhookRace?.status, "waiting");
  const afterRace = await emailThreadsService.getEmailThreadById(
    workspaceId,
    raceId,
  );
  assert.equal(afterRace?.status, "waiting");
  assert.equal(afterRace?.lastProcessedInboundMessageId, "msg_race_1");

  // List lagging webhook: older list row must not move cursor back or bounce.
  const lagPoll = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_lag",
    {
      threadId: "thread_os188_lag",
      messageId: "msg_list_old",
      messageAt: tLag.toISOString(),
      source: "poll",
    },
  );
  assert.equal(lagPoll?.status, "waiting");
  const afterLag = await emailThreadsService.getEmailThreadById(
    workspaceId,
    lagId,
  );
  assert.equal(afterLag?.status, "waiting");
  assert.equal(afterLag?.lastProcessedInboundMessageId, "msg_webhook_new");
  assert.equal(
    afterLag?.lastProcessedInboundAt?.toISOString() ?? null,
    tWebhook.toISOString(),
  );

  // Own sent mail never retriages.
  const sent = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_sent",
    {
      threadId: "thread_os188_sent",
      messageId: "msg_own_sent",
      messageAt: tReply.toISOString(),
      labels: ["sent"],
      source: "event",
    },
  );
  assert.equal(sent, null);
  const afterSent = await emailThreadsService.getEmailThreadById(
    workspaceId,
    sentId,
  );
  assert.equal(afterSent?.status, "waiting");
  assert.equal(afterSent?.lastProcessedInboundMessageId, null);

  // Migration-seeded at: older inbound does not bounce; newer does.
  const oldSeeded = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_seeded",
    {
      threadId: "thread_os188_seeded",
      messageId: "msg_already_known",
      messageAt: tOld.toISOString(),
      source: "poll",
    },
  );
  assert.equal(oldSeeded?.status, "waiting");

  const newSeeded = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_seeded",
    {
      threadId: "thread_os188_seeded",
      messageId: "msg_after_seed",
      messageAt: tWebhook.toISOString(),
      source: "poll",
    },
  );
  assert.equal(newSeeded?.status, "triage");
});
