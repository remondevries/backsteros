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
  contacts,
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
import {
  AUTO_REVIEW_DELIVERY_ID_HEADER,
  AUTO_REVIEW_MAX_ATTEMPTS,
  AUTO_REVIEW_SIGNATURE_HEADER,
  AUTO_REVIEW_TIMESTAMP_HEADER,
  encryptWebhookSecret,
} from "../lib/auto-review-webhook.js";
import {
  claimDueAutoReviewWebhookDeliveries,
  finalizeDelivery,
  resetAutoReviewWebhookTickGuardForTests,
  runDueAutoReviewWebhookDeliveries,
  sendAutoReviewWebhookTest,
  updateAutoReviewWebhookSettings,
} from "../services/auto-review-webhook.js";
import * as taskProjectService from "../services/tasks-projects.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_ROLE = "cloud";
process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY =
  process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim() ||
  "os92-integration-encryption-key";

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

async function seed(options: { agentContactBound?: boolean } = {}) {
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const agentContactId = id("contact");
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
  await db.insert(contacts).values({
    id: agentContactId,
    workspaceId,
    key: id("agent"),
    name: "Agent Persona",
    firstName: "Agent",
    lastName: "Persona",
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    contactId: options.agentContactBound ? agentContactId : null,
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
  return { userId, workspaceId, secret, projectId, agentContactId };
}

async function cleanup(workspaceId: string, projectId: string, userId: string) {
  await db
    .delete(autoReviewWebhookDeliveries)
    .where(eq(autoReviewWebhookDeliveries.workspaceId, workspaceId));
  await db
    .delete(taskActivities)
    .where(eq(taskActivities.workspaceId, workspaceId));
  await db.delete(taskComments).where(eq(taskComments.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db
    .delete(entityCounters)
    .where(eq(entityCounters.workspaceId, workspaceId));
  await db.delete(projects).where(eq(projects.id, projectId));
  await db
    .delete(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
  await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
  await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
}

function startMockWebhook(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
) {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      handler(req, res, Buffer.concat(chunks).toString("utf8"));
    });
  });
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
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: retry on 500 then dead after max attempts; 400 is dead immediately", async () => {
  resetAutoReviewWebhookTickGuardForTests();
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
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: claim/lease — two concurrent claims send a row exactly once", async () => {
  resetAutoReviewWebhookTickGuardForTests();
  const { workspaceId, projectId, userId } = await seed();
  let hits = 0;
  const hook = await startMockWebhook((_req, res) => {
    hits += 1;
    setTimeout(() => {
      res.writeHead(200);
      res.end("ok");
    }, 50);
  });

  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: hook.url,
      secret: "hook-secret",
      enabled: true,
    });
    const task = await taskProjectService.createTask(workspaceId, {
      title: "once",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    await taskProjectService.updateTask(workspaceId, task.id, {
      status: "in_review",
    });

    const [claimedA, claimedB] = await Promise.all([
      claimDueAutoReviewWebhookDeliveries(),
      claimDueAutoReviewWebhookDeliveries(),
    ]);
    assert.equal(claimedA.length + claimedB.length, 1);

    // Release the lease and race two worker ticks (in-process guard + DB claim).
    const claimed = claimedA[0] ?? claimedB[0]!;
    await db
      .update(autoReviewWebhookDeliveries)
      .set({
        status: "pending",
        nextAttemptAt: new Date(Date.now() - 1000),
      })
      .where(eq(autoReviewWebhookDeliveries.id, claimed.id));

    resetAutoReviewWebhookTickGuardForTests();
    await Promise.all([
      runDueAutoReviewWebhookDeliveries(),
      (async () => {
        await new Promise((r) => setTimeout(r, 5));
        resetAutoReviewWebhookTickGuardForTests();
        return runDueAutoReviewWebhookDeliveries();
      })(),
    ]);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(hits, 1);

    const activities = await db
      .select()
      .from(taskActivities)
      .where(eq(taskActivities.taskId, task.id));
    assert.equal(
      activities.filter((row) => row.type === "auto_review_requested").length,
      1,
    );
  } finally {
    await hook.close();
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: concurrent finalizers write success activity at most once", async () => {
  const { workspaceId, projectId, userId } = await seed();
  try {
    const task = await taskProjectService.createTask(workspaceId, {
      title: "finalize race",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    const deliveryId = id("del");
    const payload = {
      event: "task.ready_for_review" as const,
      taskId: task.id,
      taskKey: "T9-1",
      title: task.title,
      projectId,
      projectKey: "T9",
      projectName: "OS-92 test",
      assigneeId: null,
      assigneeName: null,
      timestamp: new Date().toISOString(),
      threadId: null,
      sessionId: null,
      commitHashes: [] as string[],
      deliveryId,
      attempt: 1,
    };
    const [row] = await db
      .insert(autoReviewWebhookDeliveries)
      .values({
        id: deliveryId,
        workspaceId,
        taskId: task.id,
        event: "task.ready_for_review",
        payload,
        status: "sending",
        attempt: 0,
        nextAttemptAt: new Date(Date.now() + 120_000),
      })
      .returning();
    assert.ok(row);

    const result = {
      httpStatus: 200,
      retryAfterMs: null,
      networkError: false,
      timeout: false,
      error: null,
    };
    const [a, b] = await Promise.all([
      finalizeDelivery({ row, result, payload }),
      finalizeDelivery({ row, result, payload }),
    ]);
    const outcomes = [a, b].sort();
    assert.deepEqual(outcomes, ["delivered", "skipped"]);

    const activities = await db
      .select()
      .from(taskActivities)
      .where(eq(taskActivities.taskId, task.id));
    assert.equal(
      activities.filter((row) => row.type === "auto_review_requested").length,
      1,
    );
  } finally {
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: outgoing headers carry HMAC but never the raw secret", async () => {
  resetAutoReviewWebhookTickGuardForTests();
  const { workspaceId, projectId, userId } = await seed();
  const secret = "must-not-appear-in-headers";
  let sawAuth = false;
  let sawSecret = false;
  let sawSig = false;
  const hook = await startMockWebhook((req, res) => {
    const auth = req.headers.authorization ?? "";
    if (auth) sawAuth = true;
    const all = JSON.stringify(req.headers);
    if (all.includes(secret)) sawSecret = true;
    if (req.headers[AUTO_REVIEW_SIGNATURE_HEADER]) sawSig = true;
    if (req.headers[AUTO_REVIEW_TIMESTAMP_HEADER]) {
      /* ok */
    }
    if (req.headers[AUTO_REVIEW_DELIVERY_ID_HEADER]) {
      /* ok */
    }
    res.writeHead(200);
    res.end("ok");
  });

  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: hook.url,
      secret,
      enabled: true,
    });
    const task = await taskProjectService.createTask(workspaceId, {
      title: "headers",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    await taskProjectService.updateTask(workspaceId, task.id, {
      status: "in_review",
    });
    await runDueAutoReviewWebhookDeliveries();
    assert.equal(sawAuth, false);
    assert.equal(sawSecret, false);
    assert.equal(sawSig, true);
  } finally {
    await hook.close();
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: unconfigured / disabled webhook marks delivery failed", async () => {
  resetAutoReviewWebhookTickGuardForTests();
  const { workspaceId, projectId, userId } = await seed();
  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: "http://127.0.0.1:9/unused",
      secret: "hook-secret",
      enabled: true,
    });
    const task = await taskProjectService.createTask(workspaceId, {
      title: "disabled",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    await taskProjectService.updateTask(workspaceId, task.id, {
      status: "in_review",
    });
    await updateAutoReviewWebhookSettings(workspaceId, { enabled: false });
    await runDueAutoReviewWebhookDeliveries();
    const [row] = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.taskId, task.id));
    assert.equal(row?.status, "failed");
    assert.equal(row?.lastError, "webhook disabled");
    const comments = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, task.id));
    assert.equal(
      comments.some((c) => c.body === "Auto-review trigger failed"),
      true,
    );
  } finally {
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: decrypt failure → settings 200 + delivery failed", async () => {
  resetAutoReviewWebhookTickGuardForTests();
  const app = createApp();
  const { workspaceId, projectId, userId, secret } = await seed();
  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: "http://127.0.0.1:9/unused",
      secret: "hook-secret",
      enabled: true,
    });
    // Overwrite ciphertext with bytes encrypted under a different key.
    const foreign = encryptWebhookSecret("other", {
      BACKSTEROS_SECRET_ENCRYPTION_KEY: "totally-different-key",
    });
    await db
      .update(workspaceIntegrationSecrets)
      .set({ autoReviewWebhookSecretCiphertext: foreign })
      .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));

    const settings = await json(
      app,
      "/api/v1/settings/auto-review-webhook",
      secret,
    );
    assert.equal(settings.status, 200);
    assert.equal(settings.body?.secretConfigured, false);

    const task = await taskProjectService.createTask(workspaceId, {
      title: "bad secret",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    // Enqueue bypasses isAutoReviewWebhookEnabled (decrypt fails → not enabled),
    // so insert a pending row directly to exercise the worker path.
    const deliveryId = id("del");
    await db.insert(autoReviewWebhookDeliveries).values({
      id: deliveryId,
      workspaceId,
      taskId: task.id,
      event: "task.ready_for_review",
      payload: {
        event: "task.ready_for_review",
        taskId: task.id,
        taskKey: "T9-x",
        title: task.title,
        deliveryId,
        attempt: 1,
      },
      status: "pending",
      attempt: 0,
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    await runDueAutoReviewWebhookDeliveries();
    const [row] = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.id, deliveryId));
    assert.equal(row?.status, "failed");
    assert.equal(row?.lastError, "webhook secret unreadable");
  } finally {
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: Send test inserts claimed row and does not double-send with worker", async () => {
  resetAutoReviewWebhookTickGuardForTests();
  const { workspaceId, projectId, userId } = await seed();
  let hits = 0;
  const hook = await startMockWebhook((_req, res) => {
    hits += 1;
    setTimeout(() => {
      res.writeHead(200);
      res.end("ok");
    }, 60);
  });

  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: hook.url,
      secret: "hook-secret",
      enabled: true,
    });
    const [testResult, workerHits] = await Promise.all([
      sendAutoReviewWebhookTest(workspaceId),
      runDueAutoReviewWebhookDeliveries(),
    ]);
    assert.equal(testResult.ok, true);
    assert.ok(testResult.deliveryId);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(hits, 1);
    void workerHits;

    const [row] = await db
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(eq(autoReviewWebhookDeliveries.id, testResult.deliveryId!));
    assert.equal(row?.status, "delivered");
    assert.equal((row?.payload as { test?: boolean }).test, true);
  } finally {
    await hook.close();
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: unset role with peer does not deliver; cloud does", async () => {
  resetAutoReviewWebhookTickGuardForTests();
  const { workspaceId, projectId, userId } = await seed();
  let hits = 0;
  const hook = await startMockWebhook((_req, res) => {
    hits += 1;
    res.writeHead(200);
    res.end("ok");
  });
  const prevRole = process.env.CORE_REPLICATION_ROLE;
  const prevPeer = process.env.CORE_REPLICATION_PEER_URL;
  const prevSecret = process.env.CORE_REPLICATION_SECRET;

  try {
    await updateAutoReviewWebhookSettings(workspaceId, {
      url: hook.url,
      secret: "hook-secret",
      enabled: true,
    });
    const task = await taskProjectService.createTask(workspaceId, {
      title: "role gate",
      projectId,
      status: "in_progress",
      automateCompletion: true,
    });
    assert.ok(task);
    await taskProjectService.updateTask(workspaceId, task.id, {
      status: "in_review",
    });

    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = "peer-secret-for-role-gate";
    delete process.env.CORE_REPLICATION_ROLE;
    assert.equal(await runDueAutoReviewWebhookDeliveries(), 0);
    assert.equal(hits, 0);

    process.env.CORE_REPLICATION_ROLE = "cloud";
    await runDueAutoReviewWebhookDeliveries();
    assert.equal(hits, 1);
  } finally {
    if (prevRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
    else process.env.CORE_REPLICATION_ROLE = prevRole;
    if (prevPeer === undefined) delete process.env.CORE_REPLICATION_PEER_URL;
    else process.env.CORE_REPLICATION_PEER_URL = prevPeer;
    if (prevSecret === undefined) delete process.env.CORE_REPLICATION_SECRET;
    else process.env.CORE_REPLICATION_SECRET = prevSecret;
    await hook.close();
    await cleanup(workspaceId, projectId, userId);
  }
});

test("OS-92: PATCH rejects non-https URLs; clears with empty string; owner gate", async () => {
  const app = createApp();
  const { workspaceId, secret, projectId, userId } = await seed();
  const agent = await seed({ agentContactBound: true });

  try {
    const bad = await json(app, "/api/v1/settings/auto-review-webhook", secret, {
      method: "PATCH",
      body: JSON.stringify({ url: "http://evil.example/hook" }),
    });
    assert.equal(bad.status, 400);

    const okLocal = await json(
      app,
      "/api/v1/settings/auto-review-webhook",
      secret,
      {
        method: "PATCH",
        body: JSON.stringify({
          url: "http://127.0.0.1:9999/hook",
          secret: "s",
          enabled: true,
        }),
      },
    );
    assert.equal(okLocal.status, 200);
    assert.equal(okLocal.body?.url, "http://127.0.0.1:9999/hook");

    const cleared = await json(
      app,
      "/api/v1/settings/auto-review-webhook",
      secret,
      {
        method: "PATCH",
        body: JSON.stringify({ url: "" }),
      },
    );
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body?.url, null);

    const agentPatch = await json(
      app,
      "/api/v1/settings/auto-review-webhook",
      agent.secret,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      },
    );
    assert.equal(agentPatch.status, 403);

    const agentTest = await json(
      app,
      "/api/v1/settings/auto-review-webhook/test",
      agent.secret,
      { method: "POST" },
    );
    assert.equal(agentTest.status, 403);

    const noAuth = await json(
      app,
      "/api/v1/settings/auto-review-webhook",
      null,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      },
    );
    assert.equal(noAuth.status, 401);

    const prevNode = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const savedKey = process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY;
    const savedRep = process.env.CORE_REPLICATION_SECRET;
    delete process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY;
    delete process.env.CORE_REPLICATION_SECRET;
    try {
      const noKey = await json(
        app,
        "/api/v1/settings/auto-review-webhook",
        secret,
        {
          method: "PATCH",
          body: JSON.stringify({ secret: "new-secret" }),
        },
      );
      assert.equal(noKey.status, 400);
      const settings = await json(
        app,
        "/api/v1/settings/auto-review-webhook",
        secret,
      );
      // Previous secret from okLocal may still be configured under the prior key.
      // After deleting env keys, decrypt of that ciphertext fails → not configured.
      assert.equal(settings.body?.secretConfigured, false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (savedKey !== undefined) {
        process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY = savedKey;
      }
      if (savedRep !== undefined) {
        process.env.CORE_REPLICATION_SECRET = savedRep;
      } else {
        delete process.env.CORE_REPLICATION_SECRET;
      }
      process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY =
        savedKey || "os92-integration-encryption-key";
    }
  } finally {
    await cleanup(workspaceId, projectId, userId);
    await cleanup(agent.workspaceId, agent.projectId, agent.userId);
  }
});
