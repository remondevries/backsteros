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

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  token?: string,
) {
  const response = await app.request(path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test("OS-55 /search type=task: text, key, id, pagination, invalid type", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const taskIds = {
    fibo: id("task"),
    checkout: id("task"),
    pluginA: id("task"),
    pluginB: id("task"),
    pluginC: id("task"),
    pluginD: id("task"),
    pluginE: id("task"),
    pluginF: id("task"),
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
    email: "os55@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-55",
    slug: id("os55"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os55",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "QM55",
    name: "Search project",
    status: "active",
  });

  const base = new Date("2026-10-01T12:00:00.000Z");
  const taskRows = [
    {
      id: taskIds.fibo,
      number: 38,
      title: "Delete plugin: FiboSearch - AJAX Search for WooCommerce",
      description: "no longer needed",
      status: "completed" as const,
      updatedAt: new Date(base.getTime() + 1000),
    },
    {
      id: taskIds.checkout,
      number: 12,
      title: "Renew CheckoutWC license",
      description: "license renew yearly",
      status: "ready_to_start" as const,
      updatedAt: new Date(base.getTime() + 2000),
    },
    {
      id: taskIds.pluginA,
      number: 1,
      title: "plugin alpha",
      description: null,
      status: "backlog" as const,
      updatedAt: new Date(base.getTime() + 3000),
    },
    {
      id: taskIds.pluginB,
      number: 2,
      title: "plugin beta",
      description: null,
      status: "backlog" as const,
      updatedAt: new Date(base.getTime() + 4000),
    },
    {
      id: taskIds.pluginC,
      number: 3,
      title: "plugin gamma",
      description: null,
      status: "backlog" as const,
      updatedAt: new Date(base.getTime() + 5000),
    },
    {
      id: taskIds.pluginD,
      number: 4,
      title: "plugin delta",
      description: null,
      status: "backlog" as const,
      updatedAt: new Date(base.getTime() + 6000),
    },
    {
      id: taskIds.pluginE,
      number: 5,
      title: "plugin epsilon",
      description: null,
      status: "backlog" as const,
      updatedAt: new Date(base.getTime() + 7000),
    },
    {
      id: taskIds.pluginF,
      number: 6,
      title: "plugin zeta",
      description: null,
      status: "backlog" as const,
      updatedAt: new Date(base.getTime() + 8000),
    },
  ];

  await db.insert(tasks).values(
    taskRows.map((row) => ({
      id: row.id,
      workspaceId,
      projectId,
      number: row.number,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: 0,
      sortOrder: 0,
      relatedContactIds: [],
      relatedOrganizationIds: [],
      labelIds: [],
      links: [],
      linkedCommitShas: [],
      inbox: false,
      support: false,
      notification: false,
      updatedAt: row.updatedAt,
      createdAt: row.updatedAt,
    })),
  );

  await db.insert(documents).values({
    id: docId,
    workspaceId,
    type: "knowledge",
    kind: "document",
    path: "knowledge/daily-briefing.md",
    title: "Daily Briefing",
    snippet: "morning notes",
    storageKey: `docs/${docId}`,
    contentType: "text/markdown",
    byteSize: 12,
    contentVersion: 1,
  });

  // Invalid type → 400 with field type (not empty 200).
  const bogus = await json(
    app,
    `/api/v1/search?q=FiboSearch&type=bogus`,
    secret,
  );
  assert.equal(bogus.response.status, 400);
  assert.equal(bogus.body.field, "type");

  const documentType = await json(
    app,
    `/api/v1/search?q=FiboSearch&type=document`,
    secret,
  );
  assert.equal(documentType.response.status, 400);
  assert.equal(documentType.body.field, "type");

  // Text search on tasks.
  const fibo = await json(
    app,
    `/api/v1/search?q=FiboSearch&type=task`,
    secret,
  );
  assert.equal(fibo.response.status, 200);
  const fiboResults = fibo.body.results as Array<Record<string, unknown>>;
  assert.ok(fiboResults.some((row) => row.id === taskIds.fibo));
  const fiboHit = fiboResults.find((row) => row.id === taskIds.fibo)!;
  assert.equal(fiboHit.type, "task");
  assert.equal(fiboHit.key, "QM55-38");
  assert.equal(fiboHit.projectId, projectId);
  assert.equal(fiboHit.status, "completed");
  assert.equal(fibo.body.nextCursor, null);

  const checkout = await json(
    app,
    `/api/v1/search?q=CheckoutWC&type=tasks`,
    secret,
  );
  assert.equal(checkout.response.status, 200);
  const checkoutResults = checkout.body.results as Array<Record<string, unknown>>;
  assert.equal(checkoutResults[0]?.id, taskIds.checkout);
  assert.equal(checkoutResults[0]?.key, "QM55-12");

  const license = await json(
    app,
    `/api/v1/search?q=license&type=task`,
    secret,
  );
  assert.ok(
    (license.body.results as Array<Record<string, unknown>>).some(
      (row) => row.id === taskIds.checkout,
    ),
  );

  // Display key lookup puts that task first.
  const byKey = await json(
    app,
    `/api/v1/search?q=QM55-38&type=task`,
    secret,
  );
  assert.equal(byKey.response.status, 200);
  const byKeyResults = byKey.body.results as Array<Record<string, unknown>>;
  assert.equal(byKeyResults[0]?.id, taskIds.fibo);
  assert.equal(byKeyResults[0]?.key, "QM55-38");

  // Exact task id lookup.
  const byId = await json(
    app,
    `/api/v1/search?q=${encodeURIComponent(taskIds.checkout)}&type=task`,
    secret,
  );
  assert.equal(byId.response.status, 200);
  const byIdResults = byId.body.results as Array<Record<string, unknown>>;
  assert.equal(byIdResults[0]?.id, taskIds.checkout);

  // Pagination: limit + nextCursor, no duplicates across pages.
  const page1 = await json(
    app,
    `/api/v1/search?q=plugin&type=task&limit=5`,
    secret,
  );
  assert.equal(page1.response.status, 200);
  const page1Results = page1.body.results as Array<Record<string, unknown>>;
  assert.equal(page1Results.length, 5);
  assert.equal(typeof page1.body.nextCursor, "string");

  const page2 = await json(
    app,
    `/api/v1/search?q=plugin&type=task&limit=5&cursor=${encodeURIComponent(String(page1.body.nextCursor))}`,
    secret,
  );
  assert.equal(page2.response.status, 200);
  const page2Results = page2.body.results as Array<Record<string, unknown>>;
  assert.ok(page2Results.length >= 1);
  const page1Ids = new Set(page1Results.map((row) => row.id));
  for (const row of page2Results) {
    assert.ok(!page1Ids.has(row.id), `duplicate ${row.id}`);
  }

  // Untyped search still returns documents (knowledge).
  const briefing = await json(
    app,
    `/api/v1/search?q=${encodeURIComponent("Daily Briefing")}`,
    secret,
  );
  assert.equal(briefing.response.status, 200);
  const briefingResults = briefing.body.results as Array<Record<string, unknown>>;
  assert.ok(briefingResults.some((row) => row.id === docId));
  assert.ok(briefingResults.every((row) => row.type !== "task"));
});
