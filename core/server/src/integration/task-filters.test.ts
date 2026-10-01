import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  documents,
  projects,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import {
  TASK_LIST_CURSOR_TTL_MS,
  encodeTaskListCursor,
} from "../lib/task-filters.js";

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
  };
}

test("OS-28 task filtering: filters, pagination, links, defaults", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const otherProjectId = id("project");
  const taskIds = {
    a: id("task"),
    b: id("task"),
    c: id("task"),
    done: id("task"),
    canceled: id("task"),
    orphan: id("task"),
  };
  const docId = id("doc");

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os28@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-28",
    slug: id("os28"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os28",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values([
    {
      id: projectId,
      workspaceId,
      key: "OS28",
      name: "Filter project",
      status: "active",
    },
    {
      id: otherProjectId,
      workspaceId,
      key: "OTH",
      name: "Other",
      status: "active",
    },
  ]);

  const now = Date.now();
  const dueA = new Date(now + 2 * 24 * 60 * 60 * 1000);
  const dueB = new Date(now + 5 * 24 * 60 * 60 * 1000);
  const dueC = new Date(now + 8 * 24 * 60 * 60 * 1000);

  await db.insert(tasks).values([
    {
      id: taskIds.a,
      workspaceId,
      projectId,
      number: 1,
      title: "Alpha ready",
      status: "ready_to_start",
      dueDate: dueA,
      assigneeId: null,
      relatedContactIds: [],
    },
    {
      id: taskIds.b,
      workspaceId,
      projectId,
      number: 2,
      title: "Beta progress",
      status: "in_progress",
      dueDate: dueB,
      assigneeId: null,
      relatedContactIds: [],
    },
    {
      id: taskIds.c,
      workspaceId,
      projectId: otherProjectId,
      number: 1,
      title: "Gamma other project",
      status: "ready_to_start",
      dueDate: dueC,
      assigneeId: null,
      relatedContactIds: [],
    },
    {
      id: taskIds.done,
      workspaceId,
      projectId,
      number: 3,
      title: "Done task",
      status: "completed",
      dueDate: dueA,
      assigneeId: null,
      relatedContactIds: [],
      completedAt: new Date(),
    },
    {
      id: taskIds.canceled,
      workspaceId,
      projectId,
      number: 4,
      title: "Canceled task",
      status: "canceled",
      dueDate: dueA,
      assigneeId: null,
      relatedContactIds: [],
    },
    {
      id: taskIds.orphan,
      workspaceId,
      projectId,
      number: 99,
      title: "No match filter",
      status: "on_hold",
      dueDate: null,
      assigneeId: null,
      relatedContactIds: [],
    },
  ]);

  await db.insert(documents).values({
    id: docId,
    workspaceId,
    projectId,
    kind: "document",
    type: "project",
    path: `vault/OS28/os28-doc.md`,
    title: "Linked doc",
    storageKey: `workspaces/${workspaceId}/docs/${docId}.md`,
    properties: { linkedTasks: ["OS28-1", "OS28-2"] },
  });

  // Legacy shape still works.
  const legacy = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}`,
    secret,
  );
  assert.equal(legacy.response.status, 200);
  assert.ok(Array.isArray(legacy.body.tasks));
  assert.equal(legacy.body.items, undefined);
  // OS-45: legacy rows carry the display key.
  const legacyTasks = legacy.body.tasks as Array<{ id: string; key?: string }>;
  assert.equal(
    legacyTasks.find((task) => task.id === taskIds.a)?.key,
    "OS28-1",
  );

  // OS-45: bare limit stays legacy (limit ignored, hint header set).
  const legacyLimit = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&limit=1`,
    secret,
  );
  assert.equal(legacyLimit.response.status, 200);
  assert.ok(Array.isArray(legacyLimit.body.tasks));
  assert.equal(legacyLimit.body.items, undefined);
  assert.equal((legacyLimit.body.tasks as unknown[]).length, 5);
  assert.match(
    legacyLimit.response.headers.get("x-backsteros-hint") ?? "",
    /limit/,
  );

  // OS-45: comma lists work in legacy mode too (OR).
  const legacyMulti = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&status=ready_to_start,in_progress`,
    secret,
  );
  assert.deepEqual(
    (legacyMulti.body.tasks as Array<{ id: string }>)
      .map((task) => task.id)
      .sort(),
    [taskIds.a, taskIds.b].sort(),
  );

  // OS-45: single-task response carries the key.
  const one = await json(app, `/api/v1/tasks/${taskIds.b}`, secret);
  assert.equal(one.body.key, "OS28-2");

  // Single filter (paginated).
  const single = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&paginated=true`,
    secret,
  );
  assert.equal(single.response.status, 200);
  const singleItems = single.body.items as Array<{ id: string; status: string }>;
  assert.ok(Array.isArray(singleItems));
  assert.ok(singleItems.every((item) => item.id !== taskIds.c));
  assert.ok(singleItems.every((item) => item.status !== "completed"));
  assert.ok(singleItems.every((item) => item.status !== "canceled"));

  // Multi-value OR within status.
  const multi = await json(
    app,
    `/api/v1/tasks?status=ready_to_start,in_progress&projectId=${encodeURIComponent(projectId)}&paginated=true`,
    secret,
  );
  assert.equal(multi.response.status, 200);
  const multiIds = new Set(
    (multi.body.items as Array<{ id: string }>).map((item) => item.id),
  );
  assert.ok(multiIds.has(taskIds.a));
  assert.ok(multiIds.has(taskIds.b));
  assert.ok(!multiIds.has(taskIds.orphan));
  assert.ok(!multiIds.has(taskIds.done));

  // Combined AND across fields.
  const combined = await json(
    app,
    `/api/v1/tasks?status=ready_to_start&projectId=${encodeURIComponent(otherProjectId)}&paginated=true`,
    secret,
  );
  assert.equal(combined.response.status, 200);
  const combinedItems = combined.body.items as Array<{ id: string }>;
  assert.equal(combinedItems.length, 1);
  assert.equal(combinedItems[0]?.id, taskIds.c);

  // Empty result — no error.
  const empty = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(id("missing"))}&paginated=true&includeTotalCount=true`,
    secret,
  );
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.body.nextCursor, null);
  assert.equal(empty.body.totalCount, 0);

  // Pagination with cursor.
  const page1 = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&status=ready_to_start,in_progress,on_hold&limit=2&paginated=true`,
    secret,
  );
  assert.equal(page1.response.status, 200);
  const page1Items = page1.body.items as Array<{ id: string; key: string }>;
  assert.equal(page1Items.length, 2);
  assert.equal(typeof page1.body.nextCursor, "string");
  const page2 = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&status=ready_to_start,in_progress,on_hold&limit=2&cursor=${encodeURIComponent(String(page1.body.nextCursor))}`,
    secret,
  );
  assert.equal(page2.response.status, 200);
  const page2Items = page2.body.items as Array<{ id: string }>;
  assert.ok(page2Items.length >= 1);
  const page1Ids = new Set(page1Items.map((item) => item.id));
  for (const item of page2Items) {
    assert.ok(!page1Ids.has(item.id));
  }

  // Expired cursor.
  const expired = encodeTaskListCursor(
    {
      dueDate: dueA,
      createdAt: new Date(now - 1000),
      id: taskIds.a,
    },
    Date.now() - TASK_LIST_CURSOR_TTL_MS - 1000,
  );
  const expiredRes = await json(
    app,
    `/api/v1/tasks?paginated=true&cursor=${encodeURIComponent(expired)}`,
    secret,
  );
  assert.equal(expiredRes.response.status, 400);
  assert.equal(expiredRes.body.code, "cursor_expired");
  assert.equal(expiredRes.body.field, "cursor");

  // Bidirectional link filter: document → tasks via linkedTasks index.
  const byDoc = await json(
    app,
    `/api/v1/tasks?linkedDocuments=${encodeURIComponent(docId)}&paginated=true`,
    secret,
  );
  assert.equal(byDoc.response.status, 200);
  const byDocIds = new Set(
    (byDoc.body.items as Array<{ id: string }>).map((item) => item.id),
  );
  assert.ok(byDocIds.has(taskIds.a));
  assert.ok(byDocIds.has(taskIds.b));
  assert.ok(!byDocIds.has(taskIds.c));

  const withLinks = (byDoc.body.items as Array<{
    id: string;
    linkedDocumentIds: string[];
    linkedTaskIds: string[];
  }>).find((item) => item.id === taskIds.a);
  assert.ok(withLinks);
  assert.ok(withLinks!.linkedDocumentIds.includes(docId));
  assert.ok(withLinks!.linkedTaskIds.includes(taskIds.b));

  // linkedTasks filter: co-linked tasks (A ↔ B via the same document).
  const byTask = await json(
    app,
    `/api/v1/tasks?linkedTasks=${encodeURIComponent(taskIds.a)}&paginated=true`,
    secret,
  );
  assert.equal(byTask.response.status, 200);
  const byTaskIds = new Set(
    (byTask.body.items as Array<{ id: string }>).map((item) => item.id),
  );
  assert.ok(byTaskIds.has(taskIds.b));
  assert.ok(!byTaskIds.has(taskIds.a));

  // Default exclusion of completed/canceled; include when asked.
  const openOnly = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&paginated=true`,
    secret,
  );
  const openIds = new Set(
    (openOnly.body.items as Array<{ id: string }>).map((item) => item.id),
  );
  assert.ok(!openIds.has(taskIds.done));
  assert.ok(!openIds.has(taskIds.canceled));

  const withDone = await json(
    app,
    `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}&status=completed,canceled&paginated=true`,
    secret,
  );
  const doneIds = new Set(
    (withDone.body.items as Array<{ id: string }>).map((item) => item.id),
  );
  assert.ok(doneIds.has(taskIds.done));
  assert.ok(doneIds.has(taskIds.canceled));

  // OS-45: compact rows include priority.
  assert.equal(
    typeof (openOnly.body.items as Array<{ priority: unknown }>)[0]?.priority,
    "number",
  );

  // OS-45: updatedSince change feed — includes closed + deleted tasks.
  const feedStart = new Date();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await db
    .update(tasks)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(tasks.id, taskIds.b));
  await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, taskIds.orphan));
  const feed = await json(
    app,
    `/api/v1/tasks?paginated=true&updatedSince=${encodeURIComponent(feedStart.toISOString())}`,
    secret,
  );
  assert.equal(feed.response.status, 200);
  const feedItems = feed.body.items as Array<{
    id: string;
    status: string;
    deletedAt?: string | null;
  }>;
  assert.deepEqual(
    feedItems.map((item) => item.id).sort(),
    [taskIds.b, taskIds.orphan].sort(),
  );
  assert.equal(
    feedItems.find((item) => item.id === taskIds.b)?.status,
    "completed",
  );
  assert.equal(feedItems.find((item) => item.id === taskIds.b)?.deletedAt, null);
  assert.equal(
    typeof feedItems.find((item) => item.id === taskIds.orphan)?.deletedAt,
    "string",
  );

  // Unknown field names the field.
  const unknown = await json(
    app,
    `/api/v1/tasks?paginated=true&notAFilter=1`,
    secret,
  );
  assert.equal(unknown.response.status, 400);
  assert.equal(unknown.body.field, "notAFilter");
});
