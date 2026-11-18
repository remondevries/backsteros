import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { emailThreads, users, workspaces } from "../db/schema.js";
import * as emailThreadsService from "../services/email-threads.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

test("OS-188: inbound cursor seeds on poll, retriages once on newer id, event moves ready_to_start", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const waitingId = id("email");
  const readyId = id("email");
  const eventId = id("email");

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

  await db.insert(emailThreads).values([
    {
      id: waitingId,
      workspaceId,
      inboxId: "inbox_os188_waiting",
      threadKey: "thread_os188_waiting",
      number: 1881,
      status: "waiting",
      lastProcessedInboundMessageId: null,
    },
    {
      id: readyId,
      workspaceId,
      inboxId: "inbox_os188_ready",
      threadKey: "thread_os188_ready",
      number: 1882,
      status: "ready_to_start",
      lastProcessedInboundMessageId: "msg_old",
    },
    {
      id: eventId,
      workspaceId,
      inboxId: "inbox_os188_event",
      threadKey: "thread_os188_event",
      number: 1883,
      status: "ready_to_start",
      lastProcessedInboundMessageId: null,
    },
  ]);

  // Poll first sighting: seed cursor, do not bounce Waiting.
  const seeded = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_waiting",
    {
      threadId: "thread_os188_waiting",
      messageId: "msg_already_read",
      source: "poll",
    },
  );
  assert.equal(seeded?.status, "waiting");
  const afterSeed = await emailThreadsService.getEmailThreadById(
    workspaceId,
    waitingId,
  );
  assert.equal(afterSeed?.lastProcessedInboundMessageId, "msg_already_read");
  assert.equal(afterSeed?.status, "waiting");

  const again = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_waiting",
    {
      threadId: "thread_os188_waiting",
      messageId: "msg_already_read",
      source: "poll",
    },
  );
  assert.equal(again?.status, "waiting");

  // Newer inbound id retriages ready_to_start once; same id does not twice.
  const moved = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_ready",
    {
      threadId: "thread_os188_ready",
      messageId: "msg_new_reply",
      source: "poll",
    },
  );
  assert.equal(moved?.status, "triage");
  const afterMove = await emailThreadsService.getEmailThreadById(
    workspaceId,
    readyId,
  );
  assert.equal(afterMove?.status, "triage");
  assert.equal(afterMove?.lastProcessedInboundMessageId, "msg_new_reply");

  await db
    .update(emailThreads)
    .set({ status: "waiting" })
    .where(eq(emailThreads.id, readyId));

  const duplicate = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_ready",
    {
      threadId: "thread_os188_ready",
      messageId: "msg_new_reply",
      source: "poll",
    },
  );
  assert.equal(duplicate?.status, "waiting");
  const afterDup = await emailThreadsService.getEmailThreadById(
    workspaceId,
    readyId,
  );
  assert.equal(afterDup?.status, "waiting");
  assert.equal(afterDup?.lastProcessedInboundMessageId, "msg_new_reply");

  // Webhook event retriages ready_to_start on first inbound id.
  const eventMoved = await emailThreadsService.retriageEmailThreadOnInbound(
    workspaceId,
    "inbox_os188_event",
    {
      threadId: "thread_os188_event",
      messageId: "msg_webhook_1",
      source: "event",
    },
  );
  assert.equal(eventMoved?.status, "triage");
  const eventRow = await emailThreadsService.getEmailThreadById(
    workspaceId,
    eventId,
  );
  assert.equal(eventRow?.status, "triage");
  assert.equal(eventRow?.lastProcessedInboundMessageId, "msg_webhook_1");
});
