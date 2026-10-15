import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  externalCalendarEvents,
  meetings,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { externalCalendarEventId } from "../lib/google-calendar-client.js";
import { GOOGLE_CALENDAR_PROVIDER } from "../services/google-calendar-settings.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

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

async function seed() {
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const calendarId = "primary";
  const rawGoogleId = "52bebml6dpv6mdg7l5ji8b03c0";
  const hashedId = externalCalendarEventId(
    workspaceId,
    GOOGLE_CALENDAR_PROVIDER,
    calendarId,
    rawGoogleId,
  );
  const otherRawId = "othergcalrawid000000000001";
  const otherHashedId = externalCalendarEventId(
    workspaceId,
    GOOGLE_CALENDAR_PROVIDER,
    calendarId,
    otherRawId,
  );

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-116",
    slug: id("os116"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os116",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(externalCalendarEvents).values([
    {
      id: hashedId,
      workspaceId,
      provider: GOOGLE_CALENDAR_PROVIDER,
      calendarId,
      externalId: rawGoogleId,
      title: "Neighbours over for drinks",
      startAt: new Date("2026-10-17T18:00:00.000Z"),
      endAt: new Date("2026-10-17T22:00:00.000Z"),
    },
    {
      id: otherHashedId,
      workspaceId,
      provider: GOOGLE_CALENDAR_PROVIDER,
      calendarId,
      externalId: otherRawId,
      title: "Other synced event",
      startAt: new Date("2026-10-18T10:00:00.000Z"),
      endAt: new Date("2026-10-18T11:00:00.000Z"),
    },
  ]);

  return {
    userId,
    workspaceId,
    secret,
    calendarId,
    rawGoogleId,
    hashedId,
    otherRawId,
    otherHashedId,
  };
}

async function cleanup(workspaceId: string, userId: string) {
  await db.delete(meetings).where(eq(meetings.workspaceId, workspaceId));
  await db
    .delete(externalCalendarEvents)
    .where(eq(externalCalendarEvents.workspaceId, workspaceId));
  await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
}

test("OS-116: POST with raw Google id stores hashed external_calendar_events.id", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const created = await json(app, "/api/v1/meetings", ctx.secret, {
      method: "POST",
      body: JSON.stringify({
        title: "Neighbours over for drinks",
        notes: "Shopping list",
        status: "ready_to_start",
        startAt: "2026-10-17T18:00:00.000Z",
        endAt: "2026-10-17T22:00:00.000Z",
        format: "in_person",
        location: "Home (Turfmarkt)",
        externalCalendarEventId: ctx.rawGoogleId,
        calendarId: ctx.calendarId,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body?.externalCalendarEventId, ctx.hashedId);

    const [row] = await db
      .select({
        externalCalendarEventId: meetings.externalCalendarEventId,
      })
      .from(meetings)
      .where(eq(meetings.id, String(created.body?.id)))
      .limit(1);
    assert.equal(row?.externalCalendarEventId, ctx.hashedId);
  } finally {
    await cleanup(ctx.workspaceId, ctx.userId);
  }
});

test("OS-116: POST with hashed id stores as-is", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const created = await json(app, "/api/v1/meetings", ctx.secret, {
      method: "POST",
      body: JSON.stringify({
        title: "Hashed link",
        externalCalendarEventId: ctx.hashedId,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body?.externalCalendarEventId, ctx.hashedId);
  } finally {
    await cleanup(ctx.workspaceId, ctx.userId);
  }
});

test("OS-116: POST unknown id returns 422 unknown_external_calendar_event", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const created = await json(app, "/api/v1/meetings", ctx.secret, {
      method: "POST",
      body: JSON.stringify({
        title: "Missing event",
        externalCalendarEventId: "does-not-exist-on-google-or-local",
      }),
    });
    assert.equal(created.status, 422, JSON.stringify(created.body));
    const err = created.body?.error as { code?: string } | undefined;
    assert.equal(err?.code, "unknown_external_calendar_event");
  } finally {
    await cleanup(ctx.workspaceId, ctx.userId);
  }
});

test("OS-116: POST duplicate link returns 409", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const first = await json(app, "/api/v1/meetings", ctx.secret, {
      method: "POST",
      body: JSON.stringify({
        title: "First",
        externalCalendarEventId: ctx.rawGoogleId,
      }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const second = await json(app, "/api/v1/meetings", ctx.secret, {
      method: "POST",
      body: JSON.stringify({
        title: "Second",
        externalCalendarEventId: ctx.hashedId,
      }),
    });
    assert.equal(second.status, 409, JSON.stringify(second.body));
    const err = second.body?.error as { code?: string } | undefined;
    assert.equal(err?.code, "EXTERNAL_CALENDAR_EVENT_ALREADY_LINKED");
  } finally {
    await cleanup(ctx.workspaceId, ctx.userId);
  }
});

test("OS-116: PATCH links raw id and null unlinks", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const created = await json(app, "/api/v1/meetings", ctx.secret, {
      method: "POST",
      body: JSON.stringify({ title: "Unlinked meeting" }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const meetingId = String(created.body?.id ?? "");
    assert.ok(meetingId);

    const linked = await json(app, `/api/v1/meetings/${meetingId}`, ctx.secret, {
      method: "PATCH",
      body: JSON.stringify({
        externalCalendarEventId: ctx.otherRawId,
        calendarId: ctx.calendarId,
      }),
    });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    assert.equal(linked.body?.externalCalendarEventId, ctx.otherHashedId);

    const unlinked = await json(
      app,
      `/api/v1/meetings/${meetingId}`,
      ctx.secret,
      {
        method: "PATCH",
        body: JSON.stringify({ externalCalendarEventId: null }),
      },
    );
    assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));
    assert.equal(unlinked.body?.externalCalendarEventId, null);

    const [row] = await db
      .select({
        externalCalendarEventId: meetings.externalCalendarEventId,
      })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    assert.equal(row?.externalCalendarEventId, null);
  } finally {
    await cleanup(ctx.workspaceId, ctx.userId);
  }
});
