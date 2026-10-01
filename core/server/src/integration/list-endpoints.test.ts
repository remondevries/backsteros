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
  documents,
  letters,
  meetings,
  organizations,
  projects,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

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
    body: (await response.json()) as Record<string, unknown>,
    hint: response.headers.get("X-BacksterOS-Hint"),
  };
}

test("OS-59 list endpoints: filters, pagination, enums, defaults", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const otherProjectId = id("project");
  const orgId = id("org");
  const contactIds = Array.from({ length: 8 }, () => id("contact"));
  const meetingIds = {
    os: id("meeting"),
    other: id("meeting"),
  };
  const letterId = id("letter");
  const docIds = Array.from({ length: 3 }, () => id("doc"));

  context.after(async () => {
    await db.delete(meetings).where(eq(meetings.workspaceId, workspaceId));
    await db.delete(letters).where(eq(letters.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(organizations).where(eq(organizations.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os59@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-59",
    slug: id("os59"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os59",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(organizations).values({
    id: orgId,
    workspaceId,
    key: "IN",
    name: "InShared",
  });
  await db.insert(projects).values([
    {
      id: projectId,
      workspaceId,
      key: "OS",
      name: "BacksterOS",
      status: "active",
      type: "codebase",
    },
    {
      id: otherProjectId,
      workspaceId,
      key: "OTH",
      name: "Other",
      status: "backlog",
      type: "general",
    },
  ]);
  await db.insert(contacts).values(
    contactIds.map((contactId, index) => ({
      id: contactId,
      workspaceId,
      organizationId: orgId,
      key: `C${index}`,
      name: `Contact ${index}`,
      firstName: `Contact`,
      lastName: `${index}`,
      sortOrder: index,
    })),
  );
  await db.insert(meetings).values([
    {
      id: meetingIds.os,
      workspaceId,
      number: 1,
      title: "OS standup",
      status: "ready_to_start",
      projectId,
      organizationId: orgId,
      attendeeContactIds: [contactIds[0]!],
      transcription: "secret transcript",
      startAt: new Date("2026-10-01T10:00:00.000Z"),
    },
    {
      id: meetingIds.other,
      workspaceId,
      number: 2,
      title: "Other meeting",
      status: "completed",
      projectId: otherProjectId,
      attendeeContactIds: [],
      startAt: new Date("2026-10-02T10:00:00.000Z"),
    },
  ]);
  await db.insert(letters).values({
    id: letterId,
    workspaceId,
    number: 1,
    title: "Invoice",
    status: "triage",
    direction: "incoming",
    projectId,
    organizationId: orgId,
    contactId: contactIds[0]!,
    originalFilename: "invoice.pdf",
  });
  await db.insert(documents).values(
    docIds.map((docId, index) => ({
      id: docId,
      workspaceId,
      type: "knowledge" as const,
      kind: "document" as const,
      title: `Doc ${index}`,
      path: `doc-${index}.md`,
      storageKey: `workspaces/${workspaceId}/doc-${index}.md`,
    })),
  );
  await db.insert(tasks).values({
    id: id("task"),
    workspaceId,
    projectId,
    number: 1,
    title: "Due soon",
    status: "ready_to_start",
    dueDate: new Date("2026-09-01T00:00:00.000Z"),
  });

  // Meetings: project filter + unknown project → 400
  const meetingsOs = await json(
    app,
    `/api/v1/meetings?projectId=OS`,
    secret,
  );
  assert.equal(meetingsOs.response.status, 200);
  const meetingList = meetingsOs.body.meetings as Array<Record<string, unknown>>;
  assert.equal(meetingList.length, 1);
  assert.equal(meetingList[0]!.id, meetingIds.os);
  assert.equal(meetingList[0]!.transcription, null);

  const meetingsMissing = await json(
    app,
    `/api/v1/meetings?projectId=doesnotexist`,
    secret,
  );
  assert.equal(meetingsMissing.response.status, 400);
  assert.equal(meetingsMissing.body.field, "projectId");

  // Contacts pagination walks without duplicates
  const page1 = await json(
    app,
    `/api/v1/contacts?paginated=true&limit=3`,
    secret,
  );
  assert.equal(page1.response.status, 200);
  const items1 = page1.body.items as Array<{ id: string }>;
  assert.equal(items1.length, 3);
  assert.equal(typeof page1.body.nextCursor, "string");

  const page2 = await json(
    app,
    `/api/v1/contacts?paginated=true&limit=3&cursor=${encodeURIComponent(String(page1.body.nextCursor))}`,
    secret,
  );
  assert.equal(page2.response.status, 200);
  const items2 = page2.body.items as Array<{ id: string }>;
  assert.equal(items2.length, 3);

  const page3 = await json(
    app,
    `/api/v1/contacts?paginated=true&limit=3&cursor=${encodeURIComponent(String(page2.body.nextCursor))}`,
    secret,
  );
  assert.equal(page3.response.status, 200);
  const items3 = page3.body.items as Array<{ id: string }>;
  assert.equal(items3.length, 2);
  assert.equal(page3.body.nextCursor, null);

  const allIds = [...items1, ...items2, ...items3].map((row) => row.id);
  assert.equal(new Set(allIds).size, 8);

  // Bad enums → 400 with field
  for (const [path, field] of [
    ["/api/v1/projects?status=bogus", "status"],
    ["/api/v1/letters?status=bogus", "status"],
    ["/api/v1/documents?type=bogus", "type"],
    ["/api/v1/global-search?q=x&mode=bogus", "mode"],
  ] as const) {
    const bad = await json(app, path, secret);
    assert.equal(bad.response.status, 400, path);
    assert.equal(bad.body.field, field, path);
  }

  // Documents default limit hint
  const docs = await json(app, "/api/v1/documents", secret);
  assert.equal(docs.response.status, 200);
  assert.ok(docs.hint?.includes("Default limit=100"));
  assert.ok(Array.isArray(docs.body.documents));
  assert.ok((docs.body.documents as unknown[]).length <= 100);

  // Global search limit clamp hint
  const search = await json(
    app,
    "/api/v1/global-search?q=Contact&limit=1000",
    secret,
  );
  assert.equal(search.response.status, 200);
  assert.ok(search.hint?.includes("clamped"));

  // Tasks due paginated
  const due = await json(
    app,
    "/api/v1/tasks/due?paginated=true&limit=10",
    secret,
  );
  assert.equal(due.response.status, 200);
  assert.ok(Array.isArray(due.body.items));
  assert.ok("nextCursor" in due.body);
});
