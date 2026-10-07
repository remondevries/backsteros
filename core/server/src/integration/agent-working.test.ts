import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  contacts,
  projects,
  tasks,
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
  token: string | null,
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
  const projectId = id("project");
  const ralphId = id("ralph");
  const otherAgentId = id("other");
  const ownerContactId = id("owner-contact");
  const ralphSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const otherSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const ownerSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const email = `${userId}@example.test`;

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-96",
    slug: id("os96"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values([
    {
      id: ralphId,
      workspaceId,
      key: id("ralph-key"),
      name: "Ralph",
      firstName: "Ralph",
      lastName: "Agent",
    },
    {
      id: otherAgentId,
      workspaceId,
      key: id("other-key"),
      name: "Other Agent",
      firstName: "Other",
      lastName: "Agent",
    },
    {
      id: ownerContactId,
      workspaceId,
      key: id("owner-key"),
      name: "Remon",
      firstName: "Remon",
      lastName: "Owner",
      email,
    },
  ]);
  await db.insert(apiKeys).values([
    {
      id: id("ralph-key"),
      workspaceId,
      userId,
      contactId: ralphId,
      name: "ralph",
      prefix: apiKeyLookupPrefix(ralphSecret),
      keyHash: hashApiKey(ralphSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: id("other-key"),
      workspaceId,
      userId,
      contactId: otherAgentId,
      name: "other",
      prefix: apiKeyLookupPrefix(otherSecret),
      keyHash: hashApiKey(otherSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: id("owner-key"),
      workspaceId,
      userId,
      contactId: ownerContactId,
      name: "owner",
      prefix: apiKeyLookupPrefix(ownerSecret),
      keyHash: hashApiKey(ownerSecret),
      scopes: [...API_KEY_SCOPES],
    },
  ]);
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "BF",
    name: "Business Finance",
    type: "general",
  });

  return {
    workspaceId,
    projectId,
    ralphId,
    otherAgentId,
    ralphSecret,
    otherSecret,
    ownerSecret,
  };
}

test("OS-96 agent working marker: set, clear, auto-clear, permission, response shape", async () => {
  const app = createApp();
  const ctx = await seed();

  const created = await json(app, "/api/v1/tasks", ctx.ralphSecret, {
    method: "POST",
    body: JSON.stringify({
      title: "BF agent working",
      projectId: ctx.projectId,
      status: "ready_to_start",
    }),
  });
  assert.equal(created.status, 201);
  const taskId = created.body?.id as string;
  assert.ok(taskId);

  const claimed = await json(app, `/api/v1/tasks/${taskId}`, ctx.ralphSecret, {
    method: "PATCH",
    body: JSON.stringify({
      agentWorkingContactId: ctx.ralphId,
      agentWorkingLabel: "Ralph · BF",
      activityActor: "agent",
    }),
  });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body?.agentWorkingContactId, ctx.ralphId);
  assert.equal(claimed.body?.agentWorkingContactName, "Ralph");
  assert.equal(claimed.body?.agentWorkingLabel, "Ralph · BF");
  assert.equal(typeof claimed.body?.agentWorkingStartedAt, "string");
  // Coding binding untouched
  assert.equal(claimed.body?.agentChatId ?? null, null);

  const forbidden = await json(app, `/api/v1/tasks/${taskId}`, ctx.otherSecret, {
    method: "PATCH",
    body: JSON.stringify({
      agentWorkingContactId: ctx.ralphId,
    }),
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body?.code, "agent_working_forbidden");

  const otherClear = await json(
    app,
    `/api/v1/tasks/${taskId}`,
    ctx.otherSecret,
    {
      method: "PATCH",
      body: JSON.stringify({ agentWorkingContactId: null }),
    },
  );
  assert.equal(otherClear.status, 403);

  const ownerSetsOther = await json(
    app,
    `/api/v1/tasks/${taskId}`,
    ctx.ownerSecret,
    {
      method: "PATCH",
      body: JSON.stringify({
        agentWorkingContactId: ctx.otherAgentId,
      }),
    },
  );
  assert.equal(ownerSetsOther.status, 200);
  assert.equal(ownerSetsOther.body?.agentWorkingContactId, ctx.otherAgentId);
  assert.equal(ownerSetsOther.body?.agentWorkingContactName, "Other Agent");

  // Restore Ralph for auto-clear / list checks
  const reclaim = await json(app, `/api/v1/tasks/${taskId}`, ctx.ownerSecret, {
    method: "PATCH",
    body: JSON.stringify({ agentWorkingContactId: ctx.ralphId }),
  });
  assert.equal(reclaim.status, 200);

  const listed = await json(
    app,
    `/api/v1/tasks?paginated=true&projectId=${encodeURIComponent(ctx.projectId)}`,
    ctx.ralphSecret,
  );
  assert.equal(listed.status, 200);
  const items = (listed.body?.items ?? []) as Array<Record<string, unknown>>;
  const row = items.find((item) => item.id === taskId);
  assert.ok(row);
  assert.equal(row?.agentWorkingContactId, ctx.ralphId);
  assert.equal(row?.agentWorkingContactName, "Ralph");

  const autoCleared = await json(
    app,
    `/api/v1/tasks/${taskId}`,
    ctx.ralphSecret,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "in_review",
        comment: { body: "Done for review" },
        activityActor: "agent",
      }),
    },
  );
  assert.equal(autoCleared.status, 200);
  assert.equal(autoCleared.body?.agentWorkingContactId, null);
  assert.equal(autoCleared.body?.agentWorkingStartedAt, null);
  assert.equal(autoCleared.body?.agentWorkingLabel, null);
  assert.equal(autoCleared.body?.agentWorkingContactName, null);

  // Auto-claim on in_progress for agent persona key
  const again = await json(app, `/api/v1/tasks/${taskId}`, ctx.ralphSecret, {
    method: "PATCH",
    body: JSON.stringify({
      status: "in_progress",
      activityActor: "agent",
    }),
  });
  assert.equal(again.status, 200);
  assert.equal(again.body?.agentWorkingContactId, ctx.ralphId);
  assert.equal(again.body?.agentWorkingContactName, "Ralph");

  const cleared = await json(app, `/api/v1/tasks/${taskId}`, ctx.ralphSecret, {
    method: "PATCH",
    body: JSON.stringify({ agentWorkingContactId: null }),
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body?.agentWorkingContactId, null);

  // Owner key does not auto-claim on in_progress
  const ownerProgress = await json(
    app,
    `/api/v1/tasks/${taskId}`,
    ctx.ownerSecret,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    },
  );
  assert.equal(ownerProgress.status, 200);
  assert.equal(ownerProgress.body?.agentWorkingContactId ?? null, null);

  await db.delete(tasks).where(eq(tasks.workspaceId, ctx.workspaceId));
});
