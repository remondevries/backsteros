import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  contacts,
  emailThreads,
  taskComments,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  hashApiKey,
  ticketEmailTimelineCommentId,
} from "../lib/crypto.js";
import {
  softDeleteTaskCommentRow,
  upsertEmailTimelineComment,
} from "../services/task-comments.js";
import {
  syncLinkedTicketsForEmailMessage,
  syncTicketLinkedEmails,
  type TicketEmailMessage,
} from "../services/ticket-email-sync.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  token?: string,
  init: RequestInit = {},
) {
  const response = await app.request(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  return {
    response,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  };
}

test("OS-187: visibility, authorship, triage, dedupe, deterministic id, list ingest, no-send", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const threadId = id("email");
  const clientContactId = id("contact");
  const agentContactId = id("agent");
  const messageId = `msg-${randomUUID()}`;
  const messageId2 = `msg-${randomUUID()}`;
  const emptyMessageId = `msg-empty-${randomUUID()}`;

  context.after(async () => {
    await db.delete(taskComments).where(eq(taskComments.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os187@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-187",
    slug: id("os187"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os187",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(contacts).values([
    {
      id: clientContactId,
      workspaceId,
      key: id("c"),
      name: "Jeannie Mullens",
      firstName: "Jeannie",
      lastName: "Mullens",
      email: "client@pa-mu.test",
    },
    {
      id: agentContactId,
      workspaceId,
      key: id("a"),
      name: "Agent Bot",
      firstName: "Agent",
      lastName: "Bot",
      email: "agent@backsteros.test",
    },
  ]);
  await db.insert(emailThreads).values({
    id: threadId,
    workspaceId,
    inboxId: "inbox-os187",
    threadKey: "thread-os187",
    number: 698,
    status: "backlog",
  });

  const created = await json(app, "/api/v1/tickets", secret, {
    method: "POST",
    body: JSON.stringify({
      title: "Pa-Mu login",
      support: true,
      status: "completed",
      linkedEmailIds: [threadId],
      activityActor: "agent",
    }),
  });
  assert.equal(created.response.status, 201);
  const ticketId = created.body?.id as string;
  assert.ok(ticketId);

  const secondTicket = await json(app, "/api/v1/tickets", secret, {
    method: "POST",
    body: JSON.stringify({
      title: "Pa-Mu login copy",
      support: true,
      status: "in_progress",
      linkedEmailIds: [threadId],
      activityActor: "agent",
    }),
  });
  assert.equal(secondTicket.response.status, 201);
  const ticketId2 = secondTicket.body?.id as string;
  assert.ok(ticketId2);

  const internal = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments`,
    secret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Internal note — do not show client",
        visibility: "internal",
        authorSide: "team",
        activityActor: "agent",
      }),
    },
  );
  assert.equal(internal.response.status, 201);
  assert.equal(internal.body?.visibility, "internal");

  const visible = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments`,
    secret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Client-visible reply draft note",
        visibility: "client_visible",
        authorSide: "team",
        activityActor: "agent",
      }),
    },
  );
  assert.equal(visible.response.status, 201);

  // Default list (no visibility query) is portal-safe.
  const defaultTicketComments = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments`,
    secret,
  );
  assert.equal(defaultTicketComments.response.status, 200);
  const defaultRows = defaultTicketComments.body?.comments as Array<{
    visibility: string;
    body: string;
  }>;
  assert.ok(defaultRows.every((c) => c.visibility === "client_visible"));
  assert.ok(!defaultRows.some((c) => c.body.includes("Internal note")));

  const defaultTaskComments = await json(
    app,
    `/api/v1/tasks/${ticketId}/comments`,
    secret,
  );
  assert.equal(defaultTaskComments.response.status, 200);
  const defaultTaskRows = defaultTaskComments.body?.comments as Array<{
    visibility: string;
    body: string;
  }>;
  assert.ok(defaultTaskRows.every((c) => c.visibility === "client_visible"));
  assert.ok(!defaultTaskRows.some((c) => c.body.includes("Internal note")));

  const staffAll = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments?visibility=all`,
    secret,
  );
  assert.equal(staffAll.response.status, 200);
  const allRows = staffAll.body?.comments as Array<{ visibility: string }>;
  assert.ok(allRows.some((c) => c.visibility === "internal"));

  let sendMailCalls = 0;
  const messages: TicketEmailMessage[] = [
    {
      messageId: emptyMessageId,
      threadId: "thread-os187",
      from: "client@pa-mu.test",
      subject: "",
      preview: null,
      text: null,
      timestamp: "2026-11-09T08:00:00.000Z",
      direction: "inbound",
    },
    {
      messageId,
      threadId: "thread-os187",
      from: "client@pa-mu.test",
      subject: "Login",
      preview: "Need editor rights",
      text: "Need editor rights",
      timestamp: "2026-11-09T09:00:00.000Z",
      direction: "inbound",
    },
    {
      messageId: messageId2,
      threadId: "thread-os187",
      from: "remon@lemo-design.nl",
      subject: "Re: Login",
      preview: "Granted",
      text: "Granted",
      timestamp: "2026-11-10T10:00:00.000Z",
      direction: "outbound",
    },
  ];
  const deps = {
    fetchThreadMessages: async () => messages,
    sendMail: async () => {
      sendMailCalls += 1;
      throw new Error("must not send mail");
    },
    resolveContactIdByEmail: async (_ws: string, email: string) => {
      if (email === "client@pa-mu.test") return clientContactId;
      return null;
    },
  };

  // Placeholder first, then real body on the same message id.
  const placeholder = await upsertEmailTimelineComment(workspaceId, {
    taskId: ticketId,
    emailMessageId: emptyMessageId,
    body: "(empty email)",
    emailDirection: "inbound",
    authorSide: "client",
    authorEmail: "client@pa-mu.test",
    authorContactId: clientContactId,
    occurredAt: "2026-11-09T08:00:00.000Z",
    id: ticketEmailTimelineCommentId(workspaceId, ticketId, emptyMessageId),
  });
  assert.ok(placeholder?.created);

  const backfill = await syncTicketLinkedEmails({
    workspaceId,
    taskId: ticketId,
    backfill: true,
    activityActor: "agent",
    authorContactId: agentContactId,
    deps,
  });
  assert.ok(backfill);
  assert.equal(backfill.sentMail, false);
  assert.equal(sendMailCalls, 0);
  // Latest message is outbound → status must NOT move (own mail).
  assert.equal(backfill.status, "completed");

  const clientEntry = backfill.entries?.find((e) => e.emailMessageId === messageId);
  assert.ok(clientEntry);
  assert.equal(clientEntry.authorContactId, clientContactId);
  assert.equal(clientEntry.authorEmail, "client@pa-mu.test");
  assert.equal(clientEntry.authorSide, "client");
  assert.notEqual(clientEntry.authorContactId, agentContactId);
  assert.equal(clientEntry.importedByContactId, agentContactId);

  // Replace the "(empty email)" placeholder when the real body arrives.
  const filled = await upsertEmailTimelineComment(workspaceId, {
    taskId: ticketId,
    emailMessageId: emptyMessageId,
    body: "**Late body**\n\nArrived",
    emailDirection: "inbound",
    authorSide: "client",
    authorEmail: "client@pa-mu.test",
    authorContactId: clientContactId,
    occurredAt: "2026-11-09T08:00:00.000Z",
    id: ticketEmailTimelineCommentId(workspaceId, ticketId, emptyMessageId),
  });
  assert.ok(filled);
  assert.equal(filled.created, false);
  assert.equal(filled.row.body, "**Late body**\n\nArrived");

  const expectedId = ticketEmailTimelineCommentId(workspaceId, ticketId, messageId);
  assert.equal(clientEntry.id, expectedId);

  // Soft-delete then sync again → must not recreate.
  await softDeleteTaskCommentRow(workspaceId, clientEntry.id);
  const afterDelete = await syncTicketLinkedEmails({
    workspaceId,
    taskId: ticketId,
    backfill: false,
    authorContactId: agentContactId,
    deps,
  });
  assert.ok(afterDelete);
  assert.equal(afterDelete.created, 0);
  const resurrected = await db
    .select({ id: taskComments.id, deletedAt: taskComments.deletedAt })
    .from(taskComments)
    .where(eq(taskComments.id, clientEntry.id))
    .limit(1);
  assert.ok(resurrected[0]?.deletedAt);

  // List/poll ingest path: syncLinkedTicketsForEmailMessage updates ALL linked
  // tickets to triage on inbound (including completed), without sending mail.
  await syncLinkedTicketsForEmailMessage({
    workspaceId,
    inboxId: "inbox-os187",
    messageId,
    threadId: "thread-os187",
    direction: "inbound",
    deps: {
      ...deps,
      fetchThreadMessages: async () => [
        {
          messageId,
          threadId: "thread-os187",
          from: "client@pa-mu.test",
          subject: "Login",
          preview: "Need editor rights",
          text: "Need editor rights",
          timestamp: "2026-11-09T09:00:00.000Z",
          direction: "inbound",
        },
      ],
    },
  });
  assert.equal(sendMailCalls, 0);

  const ticket1 = await json(app, `/api/v1/tickets/${ticketId}`, secret);
  const ticket2 = await json(app, `/api/v1/tickets/${ticketId2}`, secret);
  assert.equal(ticket1.body?.status, "triage");
  assert.equal(ticket2.body?.status, "triage");

  // Outbound never moves status away from triage.
  await syncLinkedTicketsForEmailMessage({
    workspaceId,
    inboxId: "inbox-os187",
    messageId: messageId2,
    threadId: "thread-os187",
    direction: "outbound",
    deps: {
      ...deps,
      fetchThreadMessages: async () => [
        {
          messageId: messageId2,
          threadId: "thread-os187",
          from: "remon@lemo-design.nl",
          subject: "Re: Login",
          preview: "Granted",
          text: "Granted",
          timestamp: "2026-11-10T10:00:00.000Z",
          direction: "outbound",
        },
      ],
    },
  });
  const stillTriage = await json(app, `/api/v1/tickets/${ticketId}`, secret);
  assert.equal(stillTriage.body?.status, "triage");
  assert.equal(sendMailCalls, 0);

  // PATCH comment must 404 when comment belongs to another ticket.
  const foreign = await upsertEmailTimelineComment(workspaceId, {
    taskId: ticketId2,
    emailMessageId: `foreign-${randomUUID()}`,
    body: "other ticket",
    emailDirection: "inbound",
    authorSide: "client",
    occurredAt: "2026-11-11T10:00:00.000Z",
  });
  assert.ok(foreign?.created);
  const badPatch = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments/${foreign!.row.id}`,
    secret,
    {
      method: "PATCH",
      body: JSON.stringify({ body: "hijack" }),
    },
  );
  assert.equal(badPatch.response.status, 404);

  const goodPatch = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments/${visible.body?.id}`,
    secret,
    {
      method: "PATCH",
      body: JSON.stringify({ body: "Client-visible reply draft note (edited)" }),
    },
  );
  assert.equal(goodPatch.response.status, 200);
  assert.equal(
    goodPatch.body?.body,
    "Client-visible reply draft note (edited)",
  );
});
