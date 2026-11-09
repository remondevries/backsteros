import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, isNull } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
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

test("project restore: soft-delete → restore same identity; auth and edge cases", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const readOnlySecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const childTaskId = id("task");
  const orphanTaskId = id("task");
  const preservedName = "max-mat.nl";
  const preservedKey = "MM";
  const preservedStatus = "active";
  const preservedChannelStatus = "needs_details";
  const preservedChannelStage = "looking_for_room";

  context.after(async () => {
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
    email: "project-restore@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "project-restore",
    slug: id("pr"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values([
    {
      id: id("key"),
      workspaceId,
      userId,
      name: "write",
      prefix: apiKeyLookupPrefix(secret),
      keyHash: hashApiKey(secret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: id("key"),
      workspaceId,
      userId,
      name: "read",
      prefix: apiKeyLookupPrefix(readOnlySecret),
      keyHash: hashApiKey(readOnlySecret),
      scopes: ["projects:read", "tasks:read"],
    },
  ]);

  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: preservedKey,
    name: preservedName,
    type: "codebase",
    status: preservedStatus,
    channelStatus: preservedChannelStatus,
    channelStage: preservedChannelStage,
    priority: 2,
    sortOrder: 10,
  });
  await db.insert(tasks).values([
    {
      id: childTaskId,
      workspaceId,
      projectId,
      number: 1,
      title: "linked task stays",
      status: "ready_to_start",
      priority: 0,
      sortOrder: 0,
    },
    {
      id: orphanTaskId,
      workspaceId,
      projectId,
      number: 2,
      title: "independently deleted child",
      status: "ready_to_start",
      priority: 0,
      sortOrder: 1,
      deletedAt: new Date("2026-11-01T00:00:00.000Z"),
    },
  ]);

  // Unauthorized
  {
    const { response } = await json(
      app,
      `/api/v1/projects/${projectId}/restore`,
      undefined,
      { method: "POST" },
    );
    assert.equal(response.status, 401);
  }
  {
    const { response } = await json(
      app,
      `/api/v1/projects/${projectId}/restore`,
      readOnlySecret,
      { method: "POST" },
    );
    assert.equal(response.status, 403);
  }

  // Soft-delete
  {
    const { response } = await json(
      app,
      `/api/v1/projects/${projectId}`,
      secret,
      { method: "DELETE" },
    );
    assert.equal(response.status, 204);
  }

  // Ordinary get/list hide soft-deleted
  {
    const { response } = await json(
      app,
      `/api/v1/projects/${projectId}`,
      secret,
    );
    assert.equal(response.status, 404);
  }
  {
    const { response } = await json(app, `/api/v1/projects/${preservedKey}`, secret);
    assert.equal(response.status, 404);
  }
  {
    const { response, body } = await json(app, "/api/v1/projects", secret);
    assert.equal(response.status, 200);
    const listed = (body?.projects as Array<{ id: string }> | undefined) ?? [];
    assert.equal(
      listed.some((p) => p.id === projectId),
      false,
    );
  }

  // Missing target
  {
    const { response } = await json(
      app,
      `/api/v1/projects/${id("missing")}/restore`,
      secret,
      { method: "POST" },
    );
    assert.equal(response.status, 404);
  }

  // Restore by soft-deleted key
  {
    const { response, body } = await json(
      app,
      `/api/v1/projects/${preservedKey}/restore`,
      secret,
      { method: "POST" },
    );
    assert.equal(response.status, 200);
    assert.equal(body?.id, projectId);
    assert.equal(body?.key, preservedKey);
    assert.equal(body?.name, preservedName);
    assert.equal(body?.status, preservedStatus);
    assert.equal(body?.channelStatus, preservedChannelStatus);
    assert.equal(body?.channelStage, preservedChannelStage);
    assert.equal(body?.deletedAt, null);
    assert.equal(body?.priority, 2);
  }

  // Normal get/list see restored project
  {
    const { response, body } = await json(
      app,
      `/api/v1/projects/${projectId}`,
      secret,
    );
    assert.equal(response.status, 200);
    assert.equal(body?.id, projectId);
    assert.equal(body?.key, preservedKey);
  }
  {
    const { response, body } = await json(app, "/api/v1/projects", secret);
    assert.equal(response.status, 200);
    const listed = (body?.projects as Array<{ id: string }> | undefined) ?? [];
    assert.equal(
      listed.some((p) => p.id === projectId),
      true,
    );
  }

  // Idempotent already-active / repeat restore
  {
    const { response, body } = await json(
      app,
      `/api/v1/projects/${projectId}/restore`,
      secret,
      { method: "POST" },
    );
    assert.equal(response.status, 200);
    assert.equal(body?.id, projectId);
    assert.equal(body?.deletedAt, null);
  }

  // Linked (non-deleted) task still present; independently deleted child stays deleted
  {
    const liveChild = await db
      .select({ id: tasks.id, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, childTaskId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    assert.equal(liveChild.length, 1);

    const orphan = await db
      .select({ id: tasks.id, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, orphanTaskId)))
      .limit(1);
    assert.equal(orphan.length, 1);
    assert.ok(orphan[0]?.deletedAt != null);
  }

  // Soft-delete again, then restore by id; collide with a live key reuse
  {
    const { response } = await json(
      app,
      `/api/v1/projects/${projectId}`,
      secret,
      { method: "DELETE" },
    );
    assert.equal(response.status, 204);
  }
  const usurperId = id("project");
  await db.insert(projects).values({
    id: usurperId,
    workspaceId,
    key: preservedKey,
    name: "replacement that took MM",
    type: "codebase",
    status: "active",
    priority: 0,
    sortOrder: 0,
  });
  {
    const { response, body } = await json(
      app,
      `/api/v1/projects/${projectId}/restore`,
      secret,
      { method: "POST" },
    );
    assert.equal(response.status, 409);
    assert.equal(body?.code, "project_key_exists");
  }

  // Cleanup usurper so restore by id works again
  await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, usurperId));
  {
    const { response, body } = await json(
      app,
      `/api/v1/projects/${projectId}/restore`,
      secret,
      { method: "POST" },
    );
    assert.equal(response.status, 200);
    assert.equal(body?.id, projectId);
    assert.equal(body?.key, preservedKey);
    assert.equal(body?.name, preservedName);
  }
});
