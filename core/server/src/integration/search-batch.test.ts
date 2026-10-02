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
import { clearAgentSearchCachesForTests } from "../services/agent-search.js";

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
    await sqlClient.end();
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
      ],
    }),
  });
  assert.equal(batch.response.status, 200);
  const batchResults = batch.body.results as Array<Record<string, unknown>>;
  assert.equal(batchResults.length, 4);
  assert.equal(batchResults[0]?.kind, "search");
  assert.equal(batchResults[1]?.kind, "search");
  assert.equal(batchResults[2]?.kind, "search");
  assert.equal(batchResults[3]?.kind, "retrieve");
  assert.ok(Array.isArray(batchResults[0]?.results));
  assert.ok(Array.isArray(batchResults[1]?.results));
  const both = batchResults[2]?.results as Array<{ type: string }>;
  assert.ok(both.some((r) => r.type === "knowledge"));
  assert.ok(both.some((r) => r.type === "task"));
  assert.equal(typeof batchResults[3]?.budget, "number");
});
