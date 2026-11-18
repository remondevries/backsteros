import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { AGENT_API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  contacts,
  emailThreads,
  taskActivities,
  taskComments,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  hashApiKey,
} from "../lib/crypto.js";
import {
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

test("OS-195: backfill/link triage rules + portal hides system activity", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const portalSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const threadOlderClient = id("email");
  const threadOoo = id("email");
  const threadClientNewest = id("email");
  const agentContactId = id("agent");

  context.after(async () => {
    await db
      .delete(taskActivities)
      .where(eq(taskActivities.workspaceId, workspaceId));
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
    email: "os195-portal@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-195 portal",
    slug: id("os195p"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values([
    {
      id: id("key"),
      workspaceId,
      userId,
      name: "owner",
      prefix: apiKeyLookupPrefix(secret),
      keyHash: hashApiKey(secret),
      scopes: [...AGENT_API_KEY_SCOPES],
    },
    {
      id: id("portal-key"),
      workspaceId,
      userId,
      name: "portal",
      prefix: apiKeyLookupPrefix(portalSecret),
      keyHash: hashApiKey(portalSecret),
      scopes: ["tasks:read", "tasks:write", "portal"],
    },
  ]);
  await db.insert(contacts).values({
    id: agentContactId,
    workspaceId,
    key: id("a"),
    name: "Agent Bot",
    firstName: "Agent",
    lastName: "Bot",
    email: "agent@backsteros.test",
  });
  await db.insert(emailThreads).values([
    {
      id: threadOlderClient,
      workspaceId,
      inboxId: "inbox-os195",
      threadKey: "thread-older-client",
      number: 19501,
      status: "waiting",
    },
    {
      id: threadOoo,
      workspaceId,
      inboxId: "inbox-os195",
      threadKey: "thread-ooo",
      number: 19502,
      status: "waiting",
    },
    {
      id: threadClientNewest,
      workspaceId,
      inboxId: "inbox-os195",
      threadKey: "thread-client-newest",
      number: 19503,
      status: "waiting",
    },
  ]);

  const outboundIdentity = {
    inboxEmails: ["remon@lemo-design.nl"],
    ownEmails: ["remon@lemo-design.nl", "email@remondevries.com"],
    ownDomains: ["lemo-design.nl"],
  };

  async function createCompletedTicket(title: string, threadId: string) {
    const created = await json(app, "/api/v1/tickets", secret, {
      method: "POST",
      body: JSON.stringify({
        title,
        support: true,
        status: "completed",
        linkedEmailIds: [threadId],
        activityActor: "agent",
      }),
    });
    assert.equal(created.response.status, 201);
    const ticketId = created.body?.id as string;
    assert.ok(ticketId);
    return ticketId;
  }

  // (3a) Linking with an older client reply after our outbound → no move.
  const olderClientTicket = await createCompletedTicket(
    "Older client after outbound",
    threadOlderClient,
  );
  const olderClientBackfill = await syncTicketLinkedEmails({
    workspaceId,
    taskId: olderClientTicket,
    backfill: true,
    activityActor: "agent",
    authorContactId: agentContactId,
    deps: {
      fetchThreadMessages: async () =>
        [
          {
            messageId: `msg-client-old-${randomUUID()}`,
            threadId: "thread-older-client",
            from: "client@pa-mu.test",
            subject: "Earlier question",
            preview: "Help",
            text: "Help",
            timestamp: "2026-11-09T09:00:00.000Z",
          },
          {
            messageId: `msg-outbound-${randomUUID()}`,
            threadId: "thread-older-client",
            from: "remon@lemo-design.nl",
            subject: "Re: Earlier question",
            preview: "Done",
            text: "Done",
            timestamp: "2026-11-10T10:00:00.000Z",
          },
        ] satisfies TicketEmailMessage[],
      resolveOutboundIdentity: async () => outboundIdentity,
    },
  });
  assert.ok(olderClientBackfill);
  assert.equal(olderClientBackfill.status, "completed");

  // (3b) Out-of-office as newest → no move.
  const oooTicket = await createCompletedTicket("OOO newest", threadOoo);
  const oooBackfill = await syncTicketLinkedEmails({
    workspaceId,
    taskId: oooTicket,
    backfill: true,
    activityActor: "agent",
    authorContactId: agentContactId,
    deps: {
      fetchThreadMessages: async () =>
        [
          {
            messageId: `msg-outbound-ooo-${randomUUID()}`,
            threadId: "thread-ooo",
            from: "remon@lemo-design.nl",
            subject: "Ping",
            preview: "Checking in",
            text: "Checking in",
            timestamp: "2026-11-10T10:00:00.000Z",
          },
          {
            messageId: `msg-ooo-${randomUUID()}`,
            threadId: "thread-ooo",
            from: "client@pa-mu.test",
            subject: "Out of office",
            preview: "Away",
            text: "Away until next week",
            timestamp: "2026-11-11T09:00:00.000Z",
            headers: {
              "Auto-Submitted": "auto-replied",
              "X-Autoreply": "yes",
              Precedence: "bulk",
            },
          },
        ] satisfies TicketEmailMessage[],
      resolveOutboundIdentity: async () => outboundIdentity,
    },
  });
  assert.ok(oooBackfill);
  assert.equal(oooBackfill.status, "completed");

  // (3c) Newest genuine client reply → Triage.
  const clientNewestTicket = await createCompletedTicket(
    "Client newest",
    threadClientNewest,
  );
  const clientNewestBackfill = await syncTicketLinkedEmails({
    workspaceId,
    taskId: clientNewestTicket,
    backfill: true,
    activityActor: "agent",
    authorContactId: agentContactId,
    deps: {
      fetchThreadMessages: async () =>
        [
          {
            messageId: `msg-outbound-then-client-${randomUUID()}`,
            threadId: "thread-client-newest",
            from: "remon@lemo-design.nl",
            subject: "Update",
            preview: "Shipped",
            text: "Shipped",
            timestamp: "2026-11-10T10:00:00.000Z",
          },
          {
            messageId: `msg-client-newest-${randomUUID()}`,
            threadId: "thread-client-newest",
            from: "client@pa-mu.test",
            subject: "Re: Update",
            preview: "Still broken",
            text: "Still broken",
            timestamp: "2026-11-12T12:00:00.000Z",
            headers: { "Auto-Submitted": "no" },
          },
        ] satisfies TicketEmailMessage[],
      resolveOutboundIdentity: async () => outboundIdentity,
    },
  });
  assert.ok(clientNewestBackfill);
  assert.equal(clientNewestBackfill.status, "triage");

  // (4) Portal key sees client-visible comments only — no system events.
  const visible = await json(
    app,
    `/api/v1/tickets/${clientNewestTicket}/comments`,
    secret,
    {
      method: "POST",
      body: JSON.stringify({
        body: "Client-visible portal note",
        visibility: "client_visible",
        authorSide: "team",
        activityActor: "agent",
      }),
    },
  );
  assert.equal(visible.response.status, 201);

  await json(app, `/api/v1/tickets/${clientNewestTicket}`, secret, {
    method: "PATCH",
    body: JSON.stringify({ status: "in_progress", activityActor: "user" }),
  });

  const portalFeed = await json(
    app,
    `/api/v1/activities?taskId=${clientNewestTicket}`,
    portalSecret,
  );
  assert.equal(portalFeed.response.status, 200);
  const portalRows = (portalFeed.body?.activities ?? []) as Array<{
    type: string;
    body: string | null;
    data?: { visibility?: string };
  }>;
  assert.ok(portalRows.length > 0);
  assert.ok(
    portalRows.every((row) => row.type === "comment"),
    "portal must not see system activity events",
  );
  assert.ok(
    portalRows.every(
      (row) => (row.data?.visibility ?? "client_visible") === "client_visible",
    ),
  );
  assert.ok(
    portalRows.some((row) => row.body?.includes("Client-visible portal note")),
  );
  assert.ok(!portalRows.some((row) => row.type === "status_changed"));

  const portalLegacy = await json(
    app,
    `/api/v1/tasks/${clientNewestTicket}/activities`,
    portalSecret,
  );
  assert.equal(portalLegacy.response.status, 200);
  assert.deepEqual(portalLegacy.body?.activities, []);

  const ownerFeed = await json(
    app,
    `/api/v1/activities?taskId=${clientNewestTicket}`,
    secret,
  );
  assert.equal(ownerFeed.response.status, 200);
  const ownerRows = (ownerFeed.body?.activities ?? []) as Array<{
    type: string;
  }>;
  assert.ok(
    ownerRows.some((row) => row.type === "status_changed"),
    "owner/agent keys still see system activity events",
  );
});
