import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  emailThreads,
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
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  };
}

test("OS-47: linkedEmailIds on task read/write; unknown emails do not 500", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const taskId = id("task");
  const threadId = id("email");

  context.after(async () => {
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os47@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-47",
    slug: id("os47"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os47",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "SC",
    name: "Support",
    status: "active",
  });
  await db.insert(emailThreads).values({
    id: threadId,
    workspaceId,
    inboxId: "inbox-1",
    threadKey: "thread-key-1",
    number: 17,
    status: "backlog",
  });
  await db.insert(tasks).values({
    id: taskId,
    workspaceId,
    projectId,
    number: 2,
    title: "Follow up on quote",
    status: "in_progress",
  });

  const linked = await json(app, "/api/v1/tasks/SC-2", secret, {
    method: "PATCH",
    body: JSON.stringify({ linkedEmailIds: ["E-17"] }),
  });
  assert.equal(linked.response.status, 200);
  assert.deepEqual(linked.body?.linkedEmailIds, [threadId]);

  const got = await json(app, "/api/v1/tasks/SC-2", secret);
  assert.equal(got.response.status, 200);
  assert.deepEqual(got.body?.linkedEmailIds, [threadId]);

  const listed = await json(
    app,
    `/api/v1/tasks?paginated=true&status=all&linkedEmails=E-17`,
    secret,
  );
  assert.equal(listed.response.status, 200);
  const items = listed.body?.items as Array<{
    id: string;
    linkedEmailIds: string[];
  }>;
  assert.ok(items.some((item) => item.id === taskId));
  const row = items.find((item) => item.id === taskId);
  assert.deepEqual(row?.linkedEmailIds, [threadId]);

  const unknownKept = await json(app, "/api/v1/tasks/SC-2", secret, {
    method: "PATCH",
    body: JSON.stringify({
      linkedEmailIds: [threadId, "missing-thread-id"],
    }),
  });
  assert.equal(unknownKept.response.status, 200);
  assert.deepEqual(unknownKept.body?.linkedEmailIds, [
    threadId,
    "missing-thread-id",
  ]);
});
