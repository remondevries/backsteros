import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  autoReviewWebhookDeliveries,
  entityCounters,
  projects,
  taskActivities,
  taskComments,
  tasks,
  users,
  workspaces,
  workspaceIntegrationSecrets,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { AUTO_REVIEW_MAX_ATTEMPTS } from "../lib/auto-review-webhook.js";
import {
  runDueAutoReviewWebhookDeliveries,
  updateAutoReviewWebhookSettings,
} from "../services/auto-review-webhook.js";
import * as taskProjectService from "../services/tasks-projects.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_ROLE = "cloud";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await app.request(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

async function seed() {
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-92",
    slug: id("os92"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os92",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "T9",
    name: "OS-92 test",
    type: "general",
  });
  return { userId, workspaceId, secret, projectId };
}

function startMockWebhook(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

test("OS-92: outbox on in_review when toggle on; not when off or completed", async () => {
  const app = createApp();
  const { workspaceId, secret, projectId, userId } = await seed();
  const hook = await startMockWebhook((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });

  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: hook.url,
      secret: "hook-secret",
      enabled: true,
    });

    const created = await json(app, "/api/v1/tasks", secret, {
      method: "POST",
      body: JSON.stringify({
        title: "toggle on",
        projectId,
        status: "in_progress",
        automateCompletion: true,
      }),
    });
    assert.ok(created.status === 200 || created.status === 201);
    const taskId = String(created.body?.id);
    assert.equal(created.body?.automateCompletion, true);

    const toReview = await json(app, `/api/v1/tasks/${taskId}`, secret, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_review", activityActor: "agent" }),
    });
    assert.equal(toReview.status, 200);

    const deliveries = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, taskId));
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.event, "task.ready_for_review");

    const again = await json(app, `/api/v1/tasks/${taskId}`, secret, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_review" }),
    });
    assert.equal(again.status, 200);
    const stillOne = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, taskId));
    assert.equal(stillOne.length, 1);

    const off = await json(app, "/api/v1/tasks", secret, {
      method: "POST",
      body: JSON.stringify({
        title: "toggle off",
        projectId,
        status: "in_progress",
        automateCompletion: false,
      }),
    });
    const offId = String(off.body?.id);
    await json(app, `/api/v1/tasks/${offId}`, secret, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_review" }),
    });
    const offDeliveries = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, offId));
    assert.equal(offDeliveries.length, 0);

    const done = await json(app, "/api/v1/tasks", secret, {
      method: "POST",
      body: JSON.stringify({
        title: "complete loop",
        projectId,
        status: "in_progress",
        automateCompletion: true,
      }),
    });
    const doneId = String(done.body?.id);
    await json(app, `/api/v1/tasks/${doneId}`, secret, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    const doneDeliveries = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, doneId));
    assert.equal(doneDeliveries.length, 0);

    const settings = await json(
      app,
      "/api/v1/settings/auto-review-webhook",
      secret,
    );
    assert.equal(settings.status, 200);
    assert.equal(settings.body?.secretConfigured, true);
    assert.equal(typeof settings.body?.secret, "undefined");
    const preview = String(settings.body?.secretPreview ?? "");
    assert.equal(preview.includes("hook-secret"), false);
  } finally {
    await hook.close();
    await db.delete(autoReviewWebhookDeliveries).where(eq(autoReviewWebhookDeliveries.workspaceId, workspaceId));
    await db.delete(taskActivities).where(eq(taskActivities.workspaceId, workspaceId));
    await db.delete(taskComments).where(eq(taskComments.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(entityCounters).where(eq(entityCounters.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(workspaceIntegrationSecrets).where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  }
});

test("OS-92: retry on 500 then dead after max attempts; 400 is dead immediately", async () => {
  const { workspaceId, projectId, userId } = await seed();
  let hits = 0;
  const hook = await startMockWebhook((_req, res) => {
    hits += 1;
    res.writeHead(500);
    res.end("no");
  });

  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: hook.url,
      secret: "hook-secret",
      enabled: true,
    });
    const task = await taskProjectService.createTask(workspaceId, {
      title: "retry",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    await taskProjectService.updateTask(workspaceId, task.id, {
      status: "in_review",
    });

    const first = await runDueAutoReviewWebhookDeliveries();
    assert.equal(first, 0);
    const [pending] = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, task.id));
    assert.equal(pending?.status, "pending");
    assert.equal(pending?.attempt, 1);

    await db
      .update(autoReviewWebhookDeliveries)
      .set({
        attempt: AUTO_REVIEW_MAX_ATTEMPTS - 1,
        nextAttemptAt: new Date(Date.now() - 1000),
      })
      .where(eq(autoReviewWebhookDeliveries.id, pending!.id));

    await runDueAutoReviewWebhookDeliveries();
    const [dead] = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.id, pending!.id));
    assert.equal(dead?.status, "failed");

    const comments = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, task.id));
    assert.equal(
      comments.some((row) => row.body === "Auto-review trigger failed"),
      true,
    );

    const four = await startMockWebhook((_req, res) => {
      res.writeHead(400);
      res.end("no");
    });
    await updateAutoReviewWebhookSettings(workspaceId, { url: four.url });
    const task2 = await taskProjectService.createTask(workspaceId, {
      title: "four",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task2);
    await taskProjectService.updateTask(workspaceId, task2.id, {
      status: "in_review",
    });
    await runDueAutoReviewWebhookDeliveries();
    const [dead400] = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, task2.id));
    assert.equal(dead400?.status, "failed");
    await four.close();
    assert.ok(hits >= 1);
  } finally {
    await hook.close();
    await db.delete(autoReviewWebhookDeliveries).where(eq(autoReviewWebhookDeliveries.workspaceId, workspaceId));
    await db.delete(taskActivities).where(eq(taskActivities.workspaceId, workspaceId));
    await db.delete(taskComments).where(eq(taskComments.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(entityCounters).where(eq(entityCounters.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(workspaceIntegrationSecrets).where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  }
});
