import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  projects,
  taskAgentPresence,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { TV_TODAY_COUNTS_SCOPE } from "../lib/tv-today-counts-auth.js";
import {
  clearAgentPresenceListeners,
  publishAgentPresence,
} from "../lib/agent-presence-events.js";
import {
  clearWorkspaceUpdatedListeners,
  publishTaskWorkspaceUpdated,
} from "../lib/workspace-events.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const SNAPSHOT = "/api/tv/v1/today-counts";
const STREAM = "/api/tv/v1/today-counts/stream";

after(async () => {
  clearAgentPresenceListeners();
  clearWorkspaceUpdatedListeners();
  await sqlClient.end();
});

async function seed() {
  const userId = id("user");
  const workspaceId = id("workspace");
  const projectId = id("project");
  const tvSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const fullSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const readSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const tvKeyId = id("tv-key");
  const fullKeyId = id("full-key");
  const readKeyId = id("read-key");

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-137",
    slug: id("os137"),
    ownerUserId: userId,
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "TV",
    name: "TV counts",
    type: "general",
  });
  await db.insert(apiKeys).values([
    {
      id: tvKeyId,
      workspaceId,
      userId,
      name: "tv-today-counts",
      prefix: apiKeyLookupPrefix(tvSecret),
      keyHash: hashApiKey(tvSecret),
      scopes: [TV_TODAY_COUNTS_SCOPE],
    },
    {
      id: fullKeyId,
      workspaceId,
      userId,
      name: "full",
      prefix: apiKeyLookupPrefix(fullSecret),
      keyHash: hashApiKey(fullSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: readKeyId,
      workspaceId,
      userId,
      name: "tasks-read",
      prefix: apiKeyLookupPrefix(readSecret),
      keyHash: hashApiKey(readSecret),
      scopes: ["tasks:read", "projects:read"],
    },
  ]);

  return {
    workspaceId,
    projectId,
    tvSecret,
    fullSecret,
    readSecret,
    tvKeyId,
    fullKeyId,
    readKeyId,
    userId,
  };
}

async function cleanup(ctx: Awaited<ReturnType<typeof seed>>) {
  await db
    .delete(taskAgentPresence)
    .where(eq(taskAgentPresence.workspaceId, ctx.workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, ctx.workspaceId));
  await db.delete(apiKeys).where(eq(apiKeys.workspaceId, ctx.workspaceId));
  await db.delete(projects).where(eq(projects.workspaceId, ctx.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ctx.workspaceId));
  await db.delete(users).where(eq(users.id, ctx.userId));
}

test("OS-137 TV today-counts: auth, snapshot payload, independent revoke", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const unauth = await app.request(SNAPSHOT);
    assert.equal(unauth.status, 401);

    const full = await app.request(SNAPSHOT, {
      headers: { authorization: `Bearer ${ctx.fullSecret}` },
    });
    assert.equal(full.status, 403);

    const readOnly = await app.request(SNAPSHOT, {
      headers: { authorization: `Bearer ${ctx.readSecret}` },
    });
    assert.equal(readOnly.status, 403);

    const due = new Date("2026-10-24T21:59:59.000Z");
    const taskIds = {
      ready: id("task"),
      progress: id("task"),
      agent: id("task"),
    };
    await db.insert(tasks).values([
      {
        id: taskIds.ready,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        number: 1,
        title: "Ready today",
        status: "ready_to_start",
        dueDate: due,
      },
      {
        id: taskIds.progress,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        number: 2,
        title: "Human progress",
        status: "in_progress",
        dueDate: due,
      },
      {
        id: taskIds.agent,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        number: 3,
        title: "Agent progress",
        status: "in_progress",
        dueDate: due,
        agentWorkingContactId: null,
      },
    ]);
    await db.insert(taskAgentPresence).values({
      taskId: taskIds.agent,
      workspaceId: ctx.workspaceId,
      source: "test",
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
    });

    // Freeze "today" by patching through the real Amsterdam calendar — use a
    // due date matching whatever today is in Europe/Amsterdam for the live assert.
    const todayYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const liveDue = new Date(`${todayYmd}T21:59:59.000Z`);
    await db
      .update(tasks)
      .set({ dueDate: liveDue })
      .where(eq(tasks.workspaceId, ctx.workspaceId));

    const ok = await app.request(SNAPSHOT, {
      headers: { authorization: `Bearer ${ctx.tvSecret}` },
    });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as {
      dueTodayTotal: number;
      statuses: { status: string; count: number }[];
      agentsWorking: number;
    };
    assert.equal(body.agentsWorking, 1);
    assert.deepEqual(body.statuses, [
      { status: "ready_to_start", count: 1 },
      { status: "in_progress", count: 1 },
    ]);
    assert.equal(body.dueTodayTotal, 3);
    assert.equal(JSON.stringify(body).includes(taskIds.ready), false);
    assert.equal(JSON.stringify(body).includes("Ready today"), false);

    // Revoke only the TV key — full key remains usable elsewhere.
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, ctx.tvKeyId));

    const revoked = await app.request(SNAPSHOT, {
      headers: { authorization: `Bearer ${ctx.tvSecret}` },
    });
    assert.equal(revoked.status, 401);

    const fullStillAuth = await app.request("/api/v1/tasks?limit=1", {
      headers: { authorization: `Bearer ${ctx.fullSecret}` },
    });
    assert.notEqual(fullStillAuth.status, 401);
  } finally {
    await cleanup(ctx);
  }
});

test("OS-137 TV today-counts stream: immediate event + push on task change", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const todayYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const due = new Date(`${todayYmd}T21:59:59.000Z`);
    const taskId = id("task");
    await db.insert(tasks).values({
      id: taskId,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      number: 1,
      title: "Stream seed",
      status: "ready_to_start",
      dueDate: due,
    });

    const response = await app.request(STREAM, {
      headers: { authorization: `Bearer ${ctx.tvSecret}` },
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/event-stream/,
    );
    assert.ok(response.body);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const events: { event: string; data: string }[] = [];

    const readUntil = async (
      predicate: () => boolean,
      timeoutMs = 5_000,
    ) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate() && Date.now() < deadline) {
        const result = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>((resolve) =>
            setTimeout(() => resolve({ done: true, value: undefined }), 250),
          ),
        ]);
        if (result.done && result.value === undefined) continue;
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) events.push({ event, data });
        }
      }
    };

    await readUntil(() => events.some((e) => e.event === "today-counts"));
    const first = events.find((e) => e.event === "today-counts");
    assert.ok(first);
    const firstPayload = JSON.parse(first.data) as {
      dueTodayTotal: number;
      agentsWorking: number;
      statuses: { status: string; count: number }[];
    };
    assert.equal(firstPayload.dueTodayTotal, 1);
    assert.deepEqual(firstPayload.statuses, [
      { status: "ready_to_start", count: 1 },
    ]);

    await db
      .update(tasks)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    publishTaskWorkspaceUpdated(ctx.workspaceId, taskId, {
      operation: "upsert",
    });

    const before = events.length;
    await readUntil(
      () =>
        events.length > before &&
        events.some(
          (e, index) =>
            index >= before &&
            e.event === "today-counts" &&
            e.data.includes('"in_progress"'),
        ),
    );
    const second = [...events]
      .reverse()
      .find((e) => e.event === "today-counts");
    assert.ok(second);
    const secondPayload = JSON.parse(second.data) as {
      statuses: { status: string; count: number }[];
    };
    assert.deepEqual(secondPayload.statuses, [
      { status: "in_progress", count: 1 },
    ]);

    await reader.cancel();
  } finally {
    await cleanup(ctx);
  }
});

test("OS-137 TV today-counts stream: push on agent presence", async () => {
  const app = createApp();
  const ctx = await seed();
  try {
    const todayYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const due = new Date(`${todayYmd}T21:59:59.000Z`);
    const taskId = id("task");
    await db.insert(tasks).values({
      id: taskId,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      number: 1,
      title: "Presence seed",
      status: "in_progress",
      dueDate: due,
    });

    const response = await app.request(STREAM, {
      headers: { authorization: `Bearer ${ctx.tvSecret}` },
    });
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const events: { event: string; data: string }[] = [];

    const readUntil = async (predicate: () => boolean, timeoutMs = 5_000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate() && Date.now() < deadline) {
        const result = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>((resolve) =>
            setTimeout(() => resolve({ done: true, value: undefined }), 250),
          ),
        ]);
        if (result.done && result.value === undefined) continue;
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) events.push({ event, data });
        }
      }
    };

    await readUntil(() => events.some((e) => e.event === "today-counts"));
    assert.ok(events[0]);
    assert.equal(JSON.parse(events[0].data).agentsWorking, 0);

    await db.insert(taskAgentPresence).values({
      taskId,
      workspaceId: ctx.workspaceId,
      source: "test",
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
    });
    publishAgentPresence({ workspaceId: ctx.workspaceId, taskId, live: true });

    const before = events.length;
    await readUntil(
      () =>
        events.length > before &&
        events.some(
          (e, index) =>
            index >= before &&
            e.event === "today-counts" &&
            JSON.parse(e.data).agentsWorking === 1,
        ),
    );
    const latest = [...events]
      .reverse()
      .find((e) => e.event === "today-counts");
    assert.ok(latest);
    const payload = JSON.parse(latest.data) as {
      agentsWorking: number;
      statuses: unknown[];
      dueTodayTotal: number;
    };
    assert.equal(payload.agentsWorking, 1);
    assert.deepEqual(payload.statuses, []);
    assert.equal(payload.dueTodayTotal, 1);

    await reader.cancel();
  } finally {
    await cleanup(ctx);
  }
});
