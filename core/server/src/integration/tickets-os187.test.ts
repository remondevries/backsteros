import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  emailThreads,
  taskComments,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import {
  syncTicketLinkedEmails,
  type TicketEmailMessage,
} from "../services/ticket-email-sync.js";
import { upsertEmailTimelineComment } from "../services/task-comments.js";

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

test("OS-187: tickets API, visibility, sync idempotency, backfill dedupe, no-send", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const threadId = id("email");
  const messageId = `msg-${randomUUID()}`;
  const messageId2 = `msg-${randomUUID()}`;

  context.after(async () => {
    await db.delete(taskComments).where(eq(taskComments.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
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
      linkedEmailIds: [threadId],
      activityActor: "agent",
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body?.support, true);
  const ticketId = created.body?.id as string;
  assert.ok(ticketId);

  const waiting = await json(app, `/api/v1/tickets/${ticketId}`, secret, {
    method: "PATCH",
    body: JSON.stringify({
      status: "waiting_on_client",
      followUpDate: "2026-11-25T12:00:00.000Z",
    }),
  });
  assert.equal(waiting.response.status, 200);
  assert.equal(waiting.body?.status, "waiting");

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
  assert.equal(internal.body?.authorSide, "team");

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
  assert.equal(visible.body?.visibility, "client_visible");

  const portalSafe = await json(
    app,
    `/api/v1/tickets/${ticketId}/comments?visibility=client_visible`,
    secret,
  );
  assert.equal(portalSafe.response.status, 200);
  const portalComments = portalSafe.body?.comments as Array<{
    visibility: string;
    body: string;
  }>;
  assert.ok(Array.isArray(portalComments));
  assert.ok(portalComments.every((c) => c.visibility === "client_visible"));
  assert.ok(
    portalComments.some((c) => c.body.includes("Client-visible")),
  );
  assert.ok(
    !portalComments.some((c) => c.body.includes("Internal note")),
  );

  let sendMailCalls = 0;
  const messages: TicketEmailMessage[] = [
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
  };

  const backfill = await syncTicketLinkedEmails({
    workspaceId,
    taskId: ticketId,
    backfill: true,
    activityActor: "agent",
    deps,
  });
  assert.ok(backfill);
  assert.equal(backfill.created, 2);
  assert.equal(backfill.sentMail, false);
  assert.equal(sendMailCalls, 0);
  assert.equal(backfill.status, "waiting");
  assert.ok(backfill.entries?.every((e) => e.importedAt != null));
  assert.ok(
    backfill.entries?.some(
      (e) => e.occurredAt === "2026-11-09T09:00:00.000Z",
    ),
  );

  const syncAgain = await syncTicketLinkedEmails({
    workspaceId,
    taskId: ticketId,
    backfill: false,
    deps,
  });
  assert.ok(syncAgain);
  assert.equal(syncAgain.created, 0);
  assert.equal(syncAgain.skipped, 2);
  assert.equal(syncAgain.sentMail, false);
  assert.equal(sendMailCalls, 0);

  const first = await upsertEmailTimelineComment(workspaceId, {
    taskId: ticketId,
    emailMessageId: messageId,
    body: "dup",
    emailDirection: "inbound",
    authorSide: "client",
    occurredAt: "2026-11-09T09:00:00.000Z",
  });
  assert.ok(first);
  assert.equal(first.created, false);

  const listed = await json(app, "/api/v1/tickets?support=true", secret);
  assert.equal(listed.response.status, 200);
  const tickets = (listed.body?.tickets ?? listed.body?.tasks) as Array<{
    id: string;
  }>;
  assert.ok(tickets.some((t) => t.id === ticketId));

  const apiSync = await json(
    app,
    `/api/v1/tickets/${ticketId}/sync-emails`,
    secret,
    {
      method: "POST",
      body: JSON.stringify({ backfill: false, activityActor: "agent" }),
    },
  );
  // Live AgentMail may be unconfigured — accept 200 with zero creates or
  // the mocked path above already covered sync. When credentials missing,
  // fetch returns [] so created=0.
  assert.equal(apiSync.response.status, 200);
  assert.equal(apiSync.body?.sentMail, false);
});
