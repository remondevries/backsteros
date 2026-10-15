import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  meetings,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

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

  return { userId, workspaceId, secret };
}

test("OS-116: POST/PATCH meetings accept externalCalendarEventId without FK row", async () => {
  const app = createApp();
  const { userId, workspaceId, secret } = await seed();
  const externalId = "52bebml6dpv6mdg7l5ji8b03c0";

  try {
    const created = await json(app, "/api/v1/meetings", secret, {
      method: "POST",
      body: JSON.stringify({
        title: "Neighbours over for drinks",
        notes: "Shopping list",
        status: "ready_to_start",
        startAt: "2026-10-17T18:00:00.000Z",
        endAt: "2026-10-17T22:00:00.000Z",
        format: "in_person",
        location: "Home (Turfmarkt)",
        externalCalendarEventId: externalId,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body?.externalCalendarEventId, externalId);
    const meetingId = String(created.body?.id ?? "");
    assert.ok(meetingId);

    const [row] = await db
      .select({
        externalCalendarEventId: meetings.externalCalendarEventId,
      })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    assert.equal(row?.externalCalendarEventId, externalId);

    const linked = await json(app, `/api/v1/meetings/${meetingId}`, secret, {
      method: "PATCH",
      body: JSON.stringify({
        externalCalendarEventId: "other-gcal-event-id-xyz",
      }),
    });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    assert.equal(linked.body?.externalCalendarEventId, "other-gcal-event-id-xyz");

    const unlinked = await json(app, `/api/v1/meetings/${meetingId}`, secret, {
      method: "PATCH",
      body: JSON.stringify({ externalCalendarEventId: null }),
    });
    assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));
    assert.equal(unlinked.body?.externalCalendarEventId, null);

    const [cleared] = await db
      .select({
        externalCalendarEventId: meetings.externalCalendarEventId,
      })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    assert.equal(cleared?.externalCalendarEventId, null);
  } finally {
    await db.delete(meetings).where(eq(meetings.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  }
});
