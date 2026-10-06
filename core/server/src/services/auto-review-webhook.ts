import { and, desc, eq, isNull, lte } from "drizzle-orm";

import type {
  AutoReviewWebhookSettings,
  AutoReviewWebhookTestResult,
  UpdateAutoReviewWebhookSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  autoReviewWebhookDeliveries,
  contacts,
  projects,
  taskAgentPresence,
  tasks,
  workspaceIntegrationSecrets,
  type DbTask,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { formatTaskDisplayKey } from "../lib/task-filters.js";
import {
  AUTO_REVIEW_EVENT,
  AUTO_REVIEW_MAX_ATTEMPTS,
  AUTO_REVIEW_TIMEOUT_MS,
  type AutoReviewReadyPayload,
  buildAutoReviewHeaders,
  classifyWebhookResponse,
  decryptWebhookSecret,
  encryptWebhookSecret,
  maskWebhookSecret,
  nextAttemptAt,
  parseRetryAfterMs,
  shouldDeliverAutoReviewWebhooks,
  shouldEnqueueAutoReview,
  stableJson,
} from "../lib/auto-review-webhook.js";
import * as taskActivityService from "./task-activities.js";
import * as taskCommentService from "./task-comments.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

const FAILED_COMMENT = "Auto-review trigger failed";
const SYSTEM_ACTOR = { userId: null, kind: "agent" as const };

export async function isAutoReviewWebhookEnabled(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({
      enabled: workspaceIntegrationSecrets.autoReviewWebhookEnabled,
      url: workspaceIntegrationSecrets.autoReviewWebhookUrl,
      secret: workspaceIntegrationSecrets.autoReviewWebhookSecretCiphertext,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return Boolean(
    row?.enabled && row.url?.trim() && row.secret?.trim(),
  );
}

export async function enqueueAutoReviewDelivery(input: {
  workspaceId: string;
  task: DbTask;
  previousStatus: string;
  nextStatus: string;
  automateCompletion: boolean;
  skipActivitySideEffects: boolean;
  timestamp?: Date;
  executor?: DbExecutor;
}): Promise<string | null> {
  const executor = input.executor ?? db;
  const enabled = await isAutoReviewWebhookEnabled(
    input.workspaceId,
    executor,
  );
  if (
    !shouldEnqueueAutoReview({
      skipActivitySideEffects: input.skipActivitySideEffects,
      webhookEnabled: enabled,
      automateCompletion: input.automateCompletion,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
    })
  ) {
    return null;
  }

  const timestamp = (input.timestamp ?? new Date()).toISOString();
  const deliveryId = newId();
  const [project, assignee, presence] = await Promise.all([
    input.task.projectId
      ? executor
          .select({
            id: projects.id,
            key: projects.key,
            name: projects.name,
          })
          .from(projects)
          .where(eq(projects.id, input.task.projectId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    input.task.assigneeId
      ? executor
          .select({
            id: contacts.id,
            name: contacts.name,
          })
          .from(contacts)
          .where(eq(contacts.id, input.task.assigneeId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    executor
      .select({ sessionId: taskAgentPresence.sessionId })
      .from(taskAgentPresence)
      .where(eq(taskAgentPresence.taskId, input.task.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const threadId = input.task.agentChatId ?? presence?.sessionId ?? null;
  const payload: AutoReviewReadyPayload = {
    event: AUTO_REVIEW_EVENT,
    taskId: input.task.id,
    taskKey: formatTaskDisplayKey(project?.key ?? null, input.task.number),
    title: input.task.title,
    projectId: project?.id ?? input.task.projectId ?? null,
    projectKey: project?.key ?? null,
    projectName: project?.name ?? null,
    assigneeId: input.task.assigneeId ?? null,
    assigneeName: assignee?.name ?? null,
    timestamp,
    threadId,
    sessionId: presence?.sessionId ?? threadId,
    commitHashes: Array.isArray(input.task.linkedCommitShas)
      ? input.task.linkedCommitShas
      : [],
    deliveryId,
    attempt: 1,
  };

  await executor.insert(autoReviewWebhookDeliveries).values({
    id: deliveryId,
    workspaceId: input.workspaceId,
    taskId: input.task.id,
    event: AUTO_REVIEW_EVENT,
    payload,
    status: "pending",
    attempt: 0,
    nextAttemptAt: new Date(),
  });

  await executor
    .update(tasks)
    .set({
      autoReviewDeliveryStatus: "pending",
      updatedAt: new Date(),
    })
    .where(
      and(eq(tasks.id, input.task.id), eq(tasks.workspaceId, input.workspaceId)),
    );

  return deliveryId;
}

async function ensureSecretRow(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<void> {
  const [existing] = await executor
    .select({ workspaceId: workspaceIntegrationSecrets.workspaceId })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  if (existing) return;
  await executor.insert(workspaceIntegrationSecrets).values({ workspaceId });
}

export async function getAutoReviewWebhookSettings(
  workspaceId: string,
): Promise<AutoReviewWebhookSettings> {
  const [secrets] = await db
    .select()
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);

  const [last] = await db
    .select()
    .from(autoReviewWebhookDeliveries)
    .where(eq(autoReviewWebhookDeliveries.workspaceId, workspaceId))
    .orderBy(desc(autoReviewWebhookDeliveries.updatedAt))
    .limit(1);

  const failures = await db
    .select()
    .from(autoReviewWebhookDeliveries)
    .where(
      and(
        eq(autoReviewWebhookDeliveries.workspaceId, workspaceId),
        eq(autoReviewWebhookDeliveries.status, "failed"),
      ),
    )
    .orderBy(desc(autoReviewWebhookDeliveries.updatedAt))
    .limit(8);

  const secretPlain = decryptWebhookSecret(
    secrets?.autoReviewWebhookSecretCiphertext,
  );
  const lastResult =
    last?.status === "delivered" ||
    last?.status === "failed" ||
    last?.status === "pending"
      ? last.status
      : null;

  return {
    enabled: Boolean(secrets?.autoReviewWebhookEnabled),
    url: secrets?.autoReviewWebhookUrl?.trim() || null,
    secretConfigured: Boolean(secretPlain),
    secretPreview: maskWebhookSecret(secretPlain),
    lastDeliveryAt: last?.lastAttemptAt?.toISOString() ?? last?.updatedAt.toISOString() ?? null,
    lastDeliveryResult: lastResult,
    lastDeliveryHttpStatus: last?.lastHttpStatus ?? null,
    lastDeliveryError: last?.lastError ?? null,
    recentFailures: failures.map((row) => {
      const payload = row.payload as AutoReviewReadyPayload;
      return {
        deliveryId: row.id,
        taskId: row.taskId,
        taskKey: typeof payload.taskKey === "string" ? payload.taskKey : null,
        at: (row.lastAttemptAt ?? row.updatedAt).toISOString(),
        error: row.lastError,
        httpStatus: row.lastHttpStatus,
        attempt: row.attempt,
      };
    }),
  };
}

export async function updateAutoReviewWebhookSettings(
  workspaceId: string,
  input: UpdateAutoReviewWebhookSettingsInput,
): Promise<AutoReviewWebhookSettings> {
  await ensureSecretRow(workspaceId);
  const patch: {
    autoReviewWebhookUrl?: string | null;
    autoReviewWebhookSecretCiphertext?: string | null;
    autoReviewWebhookEnabled?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.url !== undefined) {
    const trimmed = input.url.trim();
    patch.autoReviewWebhookUrl = trimmed || null;
  }
  if (input.secret !== undefined) {
    const trimmed = input.secret.trim();
    patch.autoReviewWebhookSecretCiphertext = trimmed
      ? encryptWebhookSecret(trimmed)
      : null;
  }
  if (input.enabled !== undefined) {
    patch.autoReviewWebhookEnabled = input.enabled;
  }

  await db
    .update(workspaceIntegrationSecrets)
    .set(patch)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));

  return getAutoReviewWebhookSettings(workspaceId);
}

type PostResult = {
  httpStatus: number | null;
  retryAfterMs: number | null;
  networkError: boolean;
  timeout: boolean;
  error: string | null;
};

async function postSignedWebhook(input: {
  url: string;
  secret: string;
  body: string;
  timestamp: string;
  deliveryId: string;
}): Promise<PostResult> {
  const headers = buildAutoReviewHeaders({
    body: input.body,
    timestamp: input.timestamp,
    secret: input.secret,
    deliveryId: input.deliveryId,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTO_REVIEW_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers,
      body: input.body,
      signal: controller.signal,
    });
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    return {
      httpStatus: response.status,
      retryAfterMs,
      networkError: false,
      timeout: false,
      error:
        response.status >= 200 && response.status < 300
          ? null
          : `HTTP ${response.status}`,
    };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      httpStatus: null,
      retryAfterMs: null,
      networkError: !timeout,
      timeout,
      error: timeout
        ? "timeout"
        : error instanceof Error
          ? error.message
          : "network error",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function markTaskDeliveryStatus(
  workspaceId: string,
  taskId: string | null,
  status: "pending" | "delivered" | "failed",
): Promise<void> {
  if (!taskId) return;
  const [row] = await db
    .update(tasks)
    .set({
      autoReviewDeliveryStatus: status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();
  if (!row) return;
  const { recordTaskRestSyncEvent } = await import("./sync.js");
  await recordTaskRestSyncEvent(workspaceId, row, "upsert");
}

async function recordSuccessActivity(
  workspaceId: string,
  taskId: string,
): Promise<void> {
  const activity = await taskActivityService.recordTaskActivity(
    workspaceId,
    taskId,
    "auto_review_requested",
    {},
    SYSTEM_ACTOR,
  );
  if (!activity) return;
  const { recordTaskActivityRestSyncEvent } = await import("./sync.js");
  await recordTaskActivityRestSyncEvent(workspaceId, activity, "upsert");
}

async function recordFailureComment(
  workspaceId: string,
  taskId: string,
): Promise<void> {
  const comment = await taskCommentService.createTaskComment(
    workspaceId,
    taskId,
    { body: FAILED_COMMENT },
    SYSTEM_ACTOR,
  );
  if (!comment) return;
  const { recordTaskCommentRestSyncEvent, loadTaskActivityRow, recordTaskActivityRestSyncEvent } =
    await import("./sync.js");
  await recordTaskCommentRestSyncEvent(workspaceId, comment, "upsert");
  const activity = await loadTaskActivityRow(workspaceId, comment.id);
  if (activity) {
    await recordTaskActivityRestSyncEvent(workspaceId, activity, "upsert");
  }
}

async function finalizeDelivery(input: {
  row: typeof autoReviewWebhookDeliveries.$inferSelect;
  result: PostResult;
  payload: AutoReviewReadyPayload;
}): Promise<"delivered" | "pending" | "failed"> {
  const classification = classifyWebhookResponse({
    httpStatus: input.result.httpStatus,
    networkError: input.result.networkError,
    timeout: input.result.timeout,
  });
  const attempt = input.payload.attempt;
  const now = new Date();

  if (classification === "success") {
    await db
      .update(autoReviewWebhookDeliveries)
      .set({
        status: "delivered",
        attempt,
        lastAttemptAt: now,
        lastHttpStatus: input.result.httpStatus,
        lastError: null,
        payload: input.payload,
        updatedAt: now,
      })
      .where(eq(autoReviewWebhookDeliveries.id, input.row.id));
    await markTaskDeliveryStatus(
      input.row.workspaceId,
      input.row.taskId,
      "delivered",
    );
    if (input.row.taskId) {
      await recordSuccessActivity(input.row.workspaceId, input.row.taskId);
    }
    return "delivered";
  }

  const exhausted =
    classification === "dead" || attempt >= AUTO_REVIEW_MAX_ATTEMPTS;
  if (exhausted) {
    await db
      .update(autoReviewWebhookDeliveries)
      .set({
        status: "failed",
        attempt,
        lastAttemptAt: now,
        lastHttpStatus: input.result.httpStatus,
        lastError: input.result.error,
        payload: input.payload,
        updatedAt: now,
      })
      .where(eq(autoReviewWebhookDeliveries.id, input.row.id));
    await markTaskDeliveryStatus(
      input.row.workspaceId,
      input.row.taskId,
      "failed",
    );
    if (input.row.taskId) {
      await recordFailureComment(input.row.workspaceId, input.row.taskId);
    }
    return "failed";
  }

  await db
    .update(autoReviewWebhookDeliveries)
    .set({
      status: "pending",
      attempt,
      lastAttemptAt: now,
      lastHttpStatus: input.result.httpStatus,
      lastError: input.result.error,
      payload: input.payload,
      nextAttemptAt: nextAttemptAt({
        failedAttempt: attempt,
        retryAfterMs: input.result.retryAfterMs,
        now,
      }),
      updatedAt: now,
    })
    .where(eq(autoReviewWebhookDeliveries.id, input.row.id));
  return "pending";
}

async function credentialsForWorkspace(workspaceId: string): Promise<{
  url: string;
  secret: string;
} | null> {
  const [row] = await db
    .select({
      url: workspaceIntegrationSecrets.autoReviewWebhookUrl,
      ciphertext: workspaceIntegrationSecrets.autoReviewWebhookSecretCiphertext,
      enabled: workspaceIntegrationSecrets.autoReviewWebhookEnabled,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  const url = row?.url?.trim() ?? "";
  const secret = decryptWebhookSecret(row?.ciphertext) ?? "";
  if (!row?.enabled || !url || !secret) return null;
  return { url, secret };
}

async function deliverRow(
  row: typeof autoReviewWebhookDeliveries.$inferSelect,
): Promise<"delivered" | "pending" | "failed" | "skipped"> {
  const creds = await credentialsForWorkspace(row.workspaceId);
  if (!creds) {
    await db
      .update(autoReviewWebhookDeliveries)
      .set({
        status: "pending",
        lastError: "webhook not configured",
        nextAttemptAt: nextAttemptAt({
          failedAttempt: Math.max(1, row.attempt),
          retryAfterMs: null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(autoReviewWebhookDeliveries.id, row.id));
    return "skipped";
  }

  const attempt = row.attempt + 1;
  const existing = (row.payload ?? {}) as Partial<AutoReviewReadyPayload>;
  const payload: AutoReviewReadyPayload = {
    event: AUTO_REVIEW_EVENT,
    taskId: existing.taskId ?? row.taskId ?? "test",
    taskKey: existing.taskKey ?? "",
    title: existing.title ?? "",
    projectId: existing.projectId ?? null,
    projectKey: existing.projectKey ?? null,
    projectName: existing.projectName ?? null,
    assigneeId: existing.assigneeId ?? null,
    assigneeName: existing.assigneeName ?? null,
    timestamp: existing.timestamp ?? new Date().toISOString(),
    threadId: existing.threadId ?? null,
    sessionId: existing.sessionId ?? null,
    commitHashes: existing.commitHashes ?? [],
    deliveryId: row.id,
    attempt,
    ...(existing.test ? { test: true } : {}),
  };
  const timestampHeader = String(Date.now());
  const body = stableJson(payload);
  const result = await postSignedWebhook({
    url: creds.url,
    secret: creds.secret,
    body,
    timestamp: timestampHeader,
    deliveryId: row.id,
  });
  return finalizeDelivery({ row, result, payload });
}

export async function runDueAutoReviewWebhookDeliveries(
  now = new Date(),
  limit = 10,
): Promise<number> {
  if (!shouldDeliverAutoReviewWebhooks()) return 0;

  const due = await db
    .select()
    .from(autoReviewWebhookDeliveries)
    .where(
      and(
        eq(autoReviewWebhookDeliveries.status, "pending"),
        lte(autoReviewWebhookDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(autoReviewWebhookDeliveries.nextAttemptAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  let delivered = 0;
  for (const row of due) {
    try {
      const outcome = await deliverRow(row);
      if (outcome === "delivered") delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "deliver failed";
      console.warn(
        `[auto-review] delivery ${row.id} failed:`,
        message,
      );
    }
  }
  return delivered;
}

export async function sendAutoReviewWebhookTest(
  workspaceId: string,
): Promise<AutoReviewWebhookTestResult> {
  const settings = await getAutoReviewWebhookSettings(workspaceId);
  if (!settings.enabled || !settings.url || !settings.secretConfigured) {
    return {
      ok: false,
      error: "Configure URL, secret, and turn the webhook on before sending a test.",
      httpStatus: null,
      deliveryId: null,
    };
  }

  const deliveryId = newId();
  const payload: AutoReviewReadyPayload = {
    event: AUTO_REVIEW_EVENT,
    taskId: "test",
    taskKey: "TEST",
    title: "Auto-review webhook test",
    projectId: null,
    projectKey: null,
    projectName: null,
    assigneeId: null,
    assigneeName: null,
    timestamp: new Date().toISOString(),
    threadId: null,
    sessionId: null,
    commitHashes: [],
    deliveryId,
    attempt: 1,
    test: true,
  };

  const [row] = await db
    .insert(autoReviewWebhookDeliveries)
    .values({
      id: deliveryId,
      workspaceId,
      taskId: null,
      event: AUTO_REVIEW_EVENT,
      payload,
      status: "pending",
      attempt: 0,
      nextAttemptAt: new Date(),
    })
    .returning();
  if (!row) {
    return {
      ok: false,
      error: "Could not write test delivery",
      httpStatus: null,
      deliveryId: null,
    };
  }

  const outcome = await deliverRow(row);
  const [updated] = await db
    .select()
    .from(autoReviewWebhookDeliveries)
    .where(eq(autoReviewWebhookDeliveries.id, deliveryId))
    .limit(1);
  return {
    ok: outcome === "delivered",
    error: updated?.lastError ?? (outcome === "delivered" ? null : "delivery failed"),
    httpStatus: updated?.lastHttpStatus ?? null,
    deliveryId,
  };
}

let workerTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoReviewWebhookWorker(intervalMs = 15_000): void {
  if (workerTimer) return;
  if (!shouldDeliverAutoReviewWebhooks()) return;
  const tick = () => {
    void runDueAutoReviewWebhookDeliveries().catch((error) => {
      console.warn(
        "[auto-review] worker tick failed:",
        error instanceof Error ? error.message : error,
      );
    });
  };
  tick();
  workerTimer = setInterval(tick, intervalMs);
}

export function stopAutoReviewWebhookWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}
