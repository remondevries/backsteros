import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  emailThreads,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import * as taskProjectService from "../services/tasks-projects.js";
import {
  type TicketEmailMessage,
  type TicketEmailSyncDeps,
} from "../services/ticket-email-sync.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

const outboundIdentity = {
  inboxEmails: ["remon@lemo-design.nl"],
  ownEmails: ["remon@lemo-design.nl", "email@remondevries.com"],
  ownDomains: ["lemo-design.nl"],
};

function depsFor(
  messages: TicketEmailMessage[],
): TicketEmailSyncDeps {
  return {
    fetchThreadMessages: async () => messages,
    resolveOutboundIdentity: async () => outboundIdentity,
  };
}

test("OS-195: linking email to a normal task triages only on genuine newest client reply", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const threadClientNewest = id("email");
  const threadOoo = id("email");
  const threadOlderClient = id("email");
  const threadOutboundNewest = id("email");

  context.after(async () => {
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os195-task-link@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-195 task link",
    slug: id("os195tl"),
    ownerUserId: userId,
  });
  await db.insert(emailThreads).values([
    {
      id: threadClientNewest,
      workspaceId,
      inboxId: "inbox-os195-task",
      threadKey: "thread-client-newest",
      number: 19511,
      status: "waiting",
    },
    {
      id: threadOoo,
      workspaceId,
      inboxId: "inbox-os195-task",
      threadKey: "thread-ooo",
      number: 19512,
      status: "waiting",
    },
    {
      id: threadOlderClient,
      workspaceId,
      inboxId: "inbox-os195-task",
      threadKey: "thread-older-client",
      number: 19513,
      status: "waiting",
    },
    {
      id: threadOutboundNewest,
      workspaceId,
      inboxId: "inbox-os195-task",
      threadKey: "thread-outbound-newest",
      number: 19514,
      status: "waiting",
    },
  ]);

  async function createCompletedTask(title: string) {
    const created = await taskProjectService.createTask(workspaceId, {
      title,
      status: "completed",
      support: false,
      activityActor: "agent",
    });
    assert.equal(created.status, "completed");
    assert.equal(created.support, false);
    return created.id;
  }

  // Newest genuine client reply → Triage (API/UI link path via updateTask).
  const clientNewestTask = await createCompletedTask("Client newest");
  const clientNewest = await taskProjectService.updateTask(
    workspaceId,
    clientNewestTask,
    { linkedEmailIds: [threadClientNewest], activityActor: "user" },
    db,
    null,
    {
      linkedEmailTriageDeps: depsFor([
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
      ]),
    },
  );
  assert.ok(clientNewest);
  assert.equal(clientNewest.status, "triage");

  // OOO newest → no move.
  const oooTask = await createCompletedTask("OOO newest");
  const ooo = await taskProjectService.updateTask(
    workspaceId,
    oooTask,
    { linkedEmailIds: [threadOoo], activityActor: "user" },
    db,
    null,
    {
      linkedEmailTriageDeps: depsFor([
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
      ]),
    },
  );
  assert.ok(ooo);
  assert.equal(ooo.status, "completed");

  // Older client after our outbound → no move.
  const olderClientTask = await createCompletedTask("Older client");
  const olderClient = await taskProjectService.updateTask(
    workspaceId,
    olderClientTask,
    { linkedEmailIds: [threadOlderClient], activityActor: "user" },
    db,
    null,
    {
      linkedEmailTriageDeps: depsFor([
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
      ]),
    },
  );
  assert.ok(olderClient);
  assert.equal(olderClient.status, "completed");

  // Outbound newest → no move.
  const outboundNewestTask = await createCompletedTask("Outbound newest");
  const outboundNewest = await taskProjectService.updateTask(
    workspaceId,
    outboundNewestTask,
    { linkedEmailIds: [threadOutboundNewest], activityActor: "user" },
    db,
    null,
    {
      linkedEmailTriageDeps: depsFor([
        {
          messageId: `msg-client-then-out-${randomUUID()}`,
          threadId: "thread-outbound-newest",
          from: "client@pa-mu.test",
          subject: "Question",
          preview: "Help",
          text: "Help",
          timestamp: "2026-11-09T09:00:00.000Z",
        },
        {
          messageId: `msg-outbound-newest-${randomUUID()}`,
          threadId: "thread-outbound-newest",
          from: "remon@lemo-design.nl",
          subject: "Re: Question",
          preview: "Answered",
          text: "Answered",
          timestamp: "2026-11-12T12:00:00.000Z",
        },
      ]),
    },
  );
  assert.ok(outboundNewest);
  assert.equal(outboundNewest.status, "completed");

  // Create-with-link (UI create-from-email) also triages on genuine newest.
  const createdLinked = await taskProjectService.createTask(
    workspaceId,
    {
      title: "Created with link",
      status: "in_progress",
      support: false,
      linkedEmailIds: [threadClientNewest],
      activityActor: "user",
    },
    undefined,
    undefined,
    null,
    {
      linkedEmailTriageDeps: depsFor([
        {
          messageId: `msg-create-client-${randomUUID()}`,
          threadId: "thread-client-newest",
          from: "client@pa-mu.test",
          subject: "Still waiting",
          preview: "Any update?",
          text: "Any update?",
          timestamp: "2026-11-13T12:00:00.000Z",
          headers: { "Auto-Submitted": "no" },
        },
      ]),
    },
  );
  assert.equal(createdLinked.status, "triage");

  // Already triage → linking must not move (no-op status).
  const triageTask = await taskProjectService.createTask(workspaceId, {
    title: "Already triage",
    status: "triage",
    support: false,
    activityActor: "agent",
  });
  const stillTriage = await taskProjectService.updateTask(
    workspaceId,
    triageTask.id,
    { linkedEmailIds: [threadOoo], activityActor: "user" },
    db,
    null,
    {
      linkedEmailTriageDeps: depsFor([
        {
          messageId: `msg-triage-client-${randomUUID()}`,
          threadId: "thread-ooo",
          from: "client@pa-mu.test",
          subject: "Hello",
          preview: "Hi",
          text: "Hi",
          timestamp: "2026-11-14T12:00:00.000Z",
        },
      ]),
    },
  );
  assert.ok(stillTriage);
  assert.equal(stillTriage.status, "triage");
});
