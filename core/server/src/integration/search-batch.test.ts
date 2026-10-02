import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db } from "../db/index.js";
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
  clearAgentSearchCachesForTests,
  mergeIncludeTaskHits,
} from "../services/agent-search.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit & { token?: string },
) {
  const headers = new Headers(init?.headers);
  if (init?.token) headers.set("authorization", `Bearer ${init.token}`);
  const response = await app.request(path, { ...init, headers });
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test("mergeIncludeTaskHits ranks by updatedAt and caps at limit", () => {
  const docs = [
    {
      id: "d1",
      type: "knowledge" as const,
      projectId: null,
      path: "a.md",
      title: "old doc",
      snippet: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "d2",
      type: "knowledge" as const,
      projectId: null,
      path: "b.md",
      title: "new doc",
      snippet: null,
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  const taskHits = [
    {
      id: "t1",
      type: "task" as const,
      key: "Q-1",
      projectId: null,
      status: "ready_to_start" as const,
      title: "mid task",
      snippet: null,
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
  ];
  const merged = mergeIncludeTaskHits(docs, taskHits, 2);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.id, "d2");
  assert.equal(merged[1]?.id, "t1");
});

test("OS-76 search batch + include=task + short-TTL cache", async (context) => {
  clearAgentSearchCachesForTests();
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const taskId = id("task");
  const docId = id("doc");

  context.after(async () => {
    clearAgentSearchCachesForTests();
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os76@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-76",
    slug: id("os76"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os76",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "Q76",
    name: "OS-76 Project",
    status: "active",
  });
  await db.insert(tasks).values({
    id: taskId,
    workspaceId,
    projectId,
    number: 76,
    title: "Reduce chained OS76BatchSearch latency",
    description: "batch and cache",
    status: "ready_to_start",
    priority: 2,
    sortOrder: 0,
    relatedContactIds: [],
    relatedOrganizationIds: [],
    labelIds: [],
    links: [],
    linkedCommitShas: [],
    inbox: false,
    support: false,
    notification: false,
  });
  await db.insert(documents).values({
    id: docId,
    workspaceId,
    projectId,
    type: "knowledge",
    kind: "document",
    path: "docs/os76-batch.md",
    title: "OS76BatchSearch architecture notes",
    snippet: "caching and batching for agents",
    storageKey: `docs/${docId}`,
    contentType: "text/markdown",
    byteSize: 0,
    contentVersion: 1,
  });

  const include = await json(
    app,
    `/api/v1/search?q=OS76BatchSearch&include=task&limit=10`,
    { token: secret },
  );
  assert.equal(include.response.status, 200);
  const includeResults = include.body.results as Array<{ type: string; title?: string }>;
  assert.ok(includeResults.some((r) => r.type === "knowledge"));
  assert.ok(includeResults.some((r) => r.type === "task"));
  assert.ok(includeResults.length <= 10);

  const badInclude = await json(
    app,
    `/api/v1/search?q=OS76BatchSearch&type=task&include=task`,
    { token: secret },
  );
  assert.equal(badInclude.response.status, 400);

  const first = await json(app, `/api/v1/search?q=OS76BatchSearch&limit=5`, {
    token: secret,
  });
  assert.equal(first.response.status, 200);
  const second = await json(app, `/api/v1/search?q=OS76BatchSearch&limit=5`, {
    token: secret,
  });
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.body.results, first.body.results);

  const batch = await json(app, "/api/v1/search/batch", {
    token: secret,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries: [
        { id: "doc", kind: "search", q: "OS76BatchSearch", limit: 5 },
        { id: "task", kind: "search", q: "OS76BatchSearch", type: "task", limit: 5 },
        {
          id: "both",
          kind: "search",
          q: "OS76BatchSearch",
          include: "task",
          limit: 10,
        },
        {
          id: "retrieve",
          kind: "retrieve",
          q: "OS76BatchSearch",
          budget: 2000,
          limit: 3,
        },
        {
          id: "bad-status",
          kind: "search",
          q: "OS76BatchSearch",
          type: "task",
          status: "not_a_real_status",
        },
      ],
    }),
  });
  assert.equal(batch.response.status, 200);
  const batchResults = batch.body.results as Array<Record<string, unknown>>;
  assert.equal(batchResults.length, 5);
  assert.equal(batchResults[0]?.kind, "search");
  assert.equal(batchResults[3]?.kind, "retrieve");
  assert.equal(batchResults[4]?.kind, "search");
  assert.equal(typeof batchResults[4]?.error, "string");
  assert.equal(batchResults[4]?.field, "status");

  const badJson = await app.request("/api/v1/search/batch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: "{not-json",
  });
  assert.equal(badJson.status, 400);
  const badJsonBody = (await badJson.json()) as { code?: string };
  assert.equal(badJsonBody.code, "bad_request");
});

test("OS-76 include=task cursor follow reaches the end without looping", async (context) => {
  clearAgentSearchCachesForTests();
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const marker = `OS76CursorFollow-${randomUUID().slice(0, 8)}`;

  context.after(async () => {
    clearAgentSearchCachesForTests();
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os76-cursor@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-76 cursor",
    slug: id("os76c"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os76-cursor",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "C76",
    name: "Cursor project",
    status: "active",
  });

  const base = new Date("2026-10-02T10:00:00.000Z");
  const taskIds: string[] = [];
  for (let i = 0; i < 7; i++) {
    const taskId = id("task");
    taskIds.push(taskId);
    await db.insert(tasks).values({
      id: taskId,
      workspaceId,
      projectId,
      number: i + 1,
      title: `${marker} task ${i}`,
      description: marker,
      status: "ready_to_start",
      priority: 0,
      sortOrder: i,
      relatedContactIds: [],
      relatedOrganizationIds: [],
      labelIds: [],
      links: [],
      linkedCommitShas: [],
      inbox: false,
      support: false,
      notification: false,
      updatedAt: new Date(base.getTime() + i * 1000),
      createdAt: new Date(base.getTime() + i * 1000),
    });
  }
  await db.insert(documents).values({
    id: id("doc"),
    workspaceId,
    projectId,
    type: "knowledge",
    kind: "document",
    path: "docs/cursor.md",
    title: `${marker} doc`,
    snippet: marker,
    storageKey: `docs/${id("s")}`,
    contentType: "text/markdown",
    byteSize: 0,
    contentVersion: 1,
    updatedAt: new Date(base.getTime() + 50_000),
  });

  const seenTaskIds = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let sawDocument = false;
  for (;;) {
    pages += 1;
    assert.ok(pages <= 20, "cursor follow did not terminate");
    const path =
      cursor == null
        ? `/api/v1/search?q=${encodeURIComponent(marker)}&include=task&limit=3`
        : `/api/v1/search?q=${encodeURIComponent(marker)}&include=task&limit=3&cursor=${encodeURIComponent(cursor)}`;
    const page = await json(app, path, { token: secret });
    assert.equal(page.response.status, 200);
    const results = page.body.results as Array<{ id: string; type: string }>;
    if (cursor == null) {
      assert.ok(results.some((r) => r.type !== "task"), "page 1 should include docs");
      sawDocument = results.some((r) => r.type === "knowledge");
    } else {
      assert.ok(
        results.every((r) => r.type === "task"),
        "page 2+ must be tasks only",
      );
    }
    for (const hit of results) {
      if (hit.type === "task") {
        assert.equal(seenTaskIds.has(hit.id), false, `duplicate task ${hit.id}`);
        seenTaskIds.add(hit.id);
      }
    }
    const next = (page.body.nextCursor as string | null | undefined) ?? null;
    if (!next) break;
    assert.notEqual(next, cursor, "cursor must advance");
    cursor = next;
  }

  assert.ok(sawDocument);
  assert.equal(seenTaskIds.size, taskIds.length);
  for (const taskId of taskIds) {
    assert.ok(seenTaskIds.has(taskId), `missing task ${taskId}`);
  }
});

test("OS-76 search cache invalidates after task create (read-after-write)", async (context) => {
  clearAgentSearchCachesForTests();
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const marker = `OS76Raw-${randomUUID().slice(0, 8)}`;

  context.after(async () => {
    clearAgentSearchCachesForTests();
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os76-raw@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-76 raw",
    slug: id("os76r"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os76-raw",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "R76",
    name: "RAW project",
    status: "active",
  });

  const before = await json(
    app,
    `/api/v1/search?q=${encodeURIComponent(marker)}&type=task&limit=10`,
    { token: secret },
  );
  assert.equal(before.response.status, 200);
  assert.equal((before.body.results as unknown[]).length, 0);

  const created = await json(app, "/api/v1/tasks", {
    token: secret,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `${marker} freshly created`,
      projectId,
      status: "ready_to_start",
    }),
  });
  assert.equal(created.response.status, 201);

  const after = await json(
    app,
    `/api/v1/search?q=${encodeURIComponent(marker)}&type=task&limit=10`,
    { token: secret },
  );
  assert.equal(after.response.status, 200);
  const afterResults = after.body.results as Array<{ title: string; type: string }>;
  assert.ok(
    afterResults.some((r) => r.type === "task" && r.title.includes(marker)),
    "search must see the newly created task (cache invalidated)",
  );
});
