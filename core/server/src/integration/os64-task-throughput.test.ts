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
  organizations,
  projects,
  taskActivities,
  taskComments,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { clearIdempotencyCacheForTests } from "../lib/idempotency.js";

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

test("OS-64: throughput writes — comment, SHAs, keys, include, idempotency, batch", async (context) => {
  clearIdempotencyCacheForTests();
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const orgId = id("org");
  const contactId = id("contact");
  const taskId = id("task");

  context.after(async () => {
    await db
      .delete(taskActivities)
      .where(eq(taskActivities.workspaceId, workspaceId));
    await db
      .delete(taskComments)
      .where(eq(taskComments.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db
      .delete(organizations)
      .where(eq(organizations.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os64@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-64",
    slug: id("os64"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os64",
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
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    organizationId: orgId,
    key: "NC4",
    name: "Remon",
    firstName: "Remon",
    lastName: "de Vries",
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "OS",
    name: "BacksterOS",
    status: "active",
  });
  await db.insert(tasks).values({
    id: taskId,
    workspaceId,
    projectId,
    number: 64,
    title: "Throughput seed",
    status: "in_progress",
    assigneeId: contactId,
    relatedContactIds: [],
    linkedCommitShas: [],
  });

  // projectKey + assigneeName on GET and paginated list
  const got = await json(app, "/api/v1/tasks/OS-64", secret);
  assert.equal(got.response.status, 200);
  assert.equal(got.body?.projectKey, "OS");
  assert.equal(got.body?.assigneeName, "Remon");
  assert.equal(got.body?.key, "OS-64");

  const listed = await json(
    app,
    "/api/v1/tasks?paginated=true&projectId=OS&status=in_progress",
    secret,
  );
  assert.equal(listed.response.status, 200);
  const items = listed.body?.items as Array<{
    id: string;
    projectKey: string | null;
    assigneeName: string | null;
  }>;
  const seedItem = items.find((row) => row.id === taskId);
  assert.ok(seedItem);
  assert.equal(seedItem?.projectKey, "OS");
  assert.equal(seedItem?.assigneeName, "Remon");

  // Status + comment in one PATCH
  const patched = await json(app, "/api/v1/tasks/OS-64", secret, {
    method: "PATCH",
    body: JSON.stringify({
      status: "canceled",
      comment: { body: "Canceled via one-call" },
      activityActor: "agent",
    }),
  });
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body?.status, "canceled");
  const inlineComment = patched.body?.comment as { body?: string } | undefined;
  assert.equal(inlineComment?.body, "Canceled via one-call");

  const comments = await json(app, "/api/v1/tasks/OS-64/comments", secret);
  assert.equal(comments.response.status, 200);
  const commentList = comments.body?.comments as Array<{ body: string }>;
  assert.ok(commentList.some((row) => row.body === "Canceled via one-call"));

  const withComments = await json(
    app,
    "/api/v1/tasks/OS-64?include=comments",
    secret,
  );
  assert.equal(withComments.response.status, 200);
  const inlineComments = withComments.body?.comments as Array<{ body: string }>;
  assert.ok(
    inlineComments.some((row) => row.body === "Canceled via one-call"),
  );

  // addLinkedCommitShas dedupe
  const addOnce = await json(app, "/api/v1/tasks/OS-64", secret, {
    method: "PATCH",
    body: JSON.stringify({ addLinkedCommitShas: ["abc1234"] }),
  });
  assert.equal(addOnce.response.status, 200);
  assert.deepEqual(addOnce.body?.linkedCommitShas, ["abc1234"]);

  const addTwice = await json(app, "/api/v1/tasks/OS-64", secret, {
    method: "PATCH",
    body: JSON.stringify({ addLinkedCommitShas: ["ABC1234", "deadbeef"] }),
  });
  assert.equal(addTwice.response.status, 200);
  assert.deepEqual(addTwice.body?.linkedCommitShas, ["abc1234", "deadbeef"]);

  // POST with projectKey + Idempotency-Key
  const createBody = {
    title: "Created with projectKey",
    projectKey: "OS",
    assigneeId: "NC4",
    comment: { body: "Created inline" },
    activityActor: "agent",
  };
  const created = await json(app, "/api/v1/tasks", secret, {
    method: "POST",
    headers: { "Idempotency-Key": "os64-create-1" },
    body: JSON.stringify(createBody),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body?.projectKey, "OS");
  assert.equal(created.body?.assigneeName, "Remon");
  assert.equal(
    (created.body?.comment as { body?: string } | undefined)?.body,
    "Created inline",
  );
  const createdId = created.body?.id as string;
  assert.ok(createdId);

  const replay = await json(app, "/api/v1/tasks", secret, {
    method: "POST",
    headers: { "Idempotency-Key": "os64-create-1" },
    body: JSON.stringify(createBody),
  });
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body?.id, createdId);

  // Batch: keys + unknown → results not_found (no invent)
  const batch = await json(app, "/api/v1/tasks/batch", secret, {
    method: "POST",
    body: JSON.stringify({
      ids: ["OS-64", "OS-99999"],
      patch: { status: "in_review" },
    }),
  });
  assert.equal(batch.response.status, 200);
  const results = batch.body?.results as Array<{
    ok: boolean;
    ref: string;
    code?: string;
  }>;
  assert.ok(results.some((row) => row.ok && row.ref === "OS-64"));
  assert.ok(
    results.some(
      (row) => !row.ok && row.ref === "OS-99999" && row.code === "not_found",
    ),
  );
  const batchTasks = batch.body?.tasks as Array<{ id: string; status: string }>;
  assert.ok(batchTasks.some((row) => row.id === taskId && row.status === "in_review"));
  assert.equal(
    batchTasks.some((row) => row.id === "OS-99999"),
    false,
  );
});
