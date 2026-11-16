/**
 * Round 4: external_calendar_events replicate ahead of meetings, and a meeting
 * whose external_calendar_event_id parent has not landed yet still applies with
 * the link nulled (the FK is optional) instead of dead-lettering.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq, inArray } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  externalCalendarEvents,
  meetings,
  replicationDeadLetters,
  users,
  workspaces,
} from "../db/schema.js";
import { applyRemoteChanges } from "../services/core-replication/apply.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

async function seedWorkspace() {
  const userId = id("user");
  const workspaceId = id("workspace");
  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Calendar FK WS",
    slug: id("cal"),
    ownerUserId: userId,
  });
  return { userId, workspaceId };
}

function meetingRow(args: {
  id: string;
  workspaceId: string;
  externalCalendarEventId: string | null;
}) {
  const now = new Date().toISOString();
  return {
    id: args.id,
    workspace_id: args.workspaceId,
    title: "Linked meeting",
    status: "ready_to_start",
    external_calendar_event_id: args.externalCalendarEventId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

test("meeting with a missing external_calendar_event parent applies with the link nulled", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const meetingId = id("meeting");
  const missingEventId = id("ece-missing");

  context.after(async () => {
    await db
      .delete(replicationDeadLetters)
      .where(inArray(replicationDeadLetters.rowId, [meetingId]));
    await db.delete(meetings).where(eq(meetings.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  const result = await applyRemoteChanges("meetings", [
    {
      table: "meetings",
      row: meetingRow({
        id: meetingId,
        workspaceId,
        externalCalendarEventId: missingEventId,
      }),
    },
  ]);

  assert.equal(result.failed.length, 0, "FK miss must not dead-letter");
  assert.equal(result.applied, 1);
  const [row] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  assert.ok(row, "meeting landed");
  assert.equal(row.externalCalendarEventId, null);
});

test("meeting keeps external_calendar_event_id when the parent exists", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const meetingId = id("meeting");
  const eventId = id("ece");

  context.after(async () => {
    await db.delete(meetings).where(eq(meetings.workspaceId, workspaceId));
    await db
      .delete(externalCalendarEvents)
      .where(eq(externalCalendarEvents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(externalCalendarEvents).values({
    id: eventId,
    workspaceId,
    provider: "google_calendar",
    calendarId: "primary",
    externalId: id("ext"),
    title: "Agenda block",
  });

  const result = await applyRemoteChanges("meetings", [
    {
      table: "meetings",
      row: meetingRow({
        id: meetingId,
        workspaceId,
        externalCalendarEventId: eventId,
      }),
    },
  ]);

  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);
  const [row] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  assert.equal(row?.externalCalendarEventId, eventId);
});

test("external_calendar_events rows apply through the twin path", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const eventId = id("ece");
  const now = new Date().toISOString();

  context.after(async () => {
    await db
      .delete(externalCalendarEvents)
      .where(eq(externalCalendarEvents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  const result = await applyRemoteChanges("external_calendar_events", [
    {
      table: "external_calendar_events",
      row: {
        id: eventId,
        workspace_id: workspaceId,
        provider: "google_calendar",
        calendar_id: "primary",
        external_id: id("ext"),
        title: "Standup",
        all_day: false,
        raw: { kind: "calendar#event" },
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    },
  ]);

  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);
  const [row] = await db
    .select()
    .from(externalCalendarEvents)
    .where(eq(externalCalendarEvents.id, eventId));
  assert.equal(row?.title, "Standup");
});
