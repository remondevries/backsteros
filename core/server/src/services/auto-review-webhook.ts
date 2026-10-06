import { and, desc, eq, isNull, lte, or } from "drizzle-orm";

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
  AUTO_REVIEW_CLAIM_LIMIT,
  AUTO_REVIEW_EVENT,
  AUTO_REVIEW_MAX_ATTEMPTS,
  AUTO_REVIEW_TIMEOUT_MS,
  type AutoReviewReadyPayload,
  type AutoReviewSecretBundle,
  autoReviewSendLeaseMs,
  buildAutoReviewHeaders,
  canEncryptWebhookSecret,
  classifyWebhookResponse,
  decryptAutoReviewSecretBundle,
  encryptAutoReviewSecretBundle,
  mapAutoReviewDeliveryStatusForApi,
  maskWebhookSecret,
  nextAttemptAt,
  parseRetryAfterMs,
  shouldDeliverAutoReviewWebhooks,
  shouldEnqueueAutoReview,
  stableJson,
  validateAutoReviewWebhookUrl,
} from "../lib/auto-review-webhook.js";
import * as taskActivityService from "./task-activities.js";
import * as taskCommentService from "./task-comments.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

const FAILED_COMMENT = "Auto-review trigger failed";
const SYSTEM_ACTOR = { userId: null, kind: "agent" as const };

async function loadSecretBundle(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<AutoReviewSecretBundle> {
  const [row] = await executor
    .select({
      ciphertext: workspaceIntegrationSecrets.autoReviewWebhookSecretCiphertext,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return decryptAutoReviewSecretBundle(row?.ciphertext);
}

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
  if (!row?.enabled || !row.url?.trim() || !row.secret?.trim()) return false;
  const bundle = decryptAutoReviewSecretBundle(row.secret);
  return Boolean(bundle.hmacSecret);
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

  const bundle = decryptAutoReviewSecretBundle(
    secrets?.autoReviewWebhookSecretCiphertext,
  );
  const lastResult = mapAutoReviewDeliveryStatusForApi(last?.status ?? null);

  return {
    enabled: Boolean(secrets?.autoReviewWebhookEnabled),
    url: secrets?.autoReviewWebhookUrl?.trim() || null,
    secretConfigured: Boolean(bundle.hmacSecret),
    secretPreview: maskWebhookSecret(bundle.hmacSecret),
    authorizationHeaderConfigured: Boolean(bundle.authorizationHeader),
    authorizationHeaderPreview: maskWebhookSecret(bundle.authorizationHeader),
    lastDeliveryAt:
      last?.lastAttemptAt?.toISOString() ??
      last?.updatedAt.toISOString() ??
      null,
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

export class AutoReviewWebhookSettingsError extends Error {
  constructor(
    message: string,
    readonly code: "bad_request" = "bad_request",
  ) {
    super(message);
    this.name = "AutoReviewWebhookSettingsError";
  }
}

export async function updateAutoReviewWebhookSettings(
  workspaceId: string,
  input: UpdateAutoReviewWebhookSettingsInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AutoReviewWebhookSettings> {
  await ensureSecretRow(workspaceId);
  const patch: {
    autoReviewWebhookUrl?: string | null;
    autoReviewWebhookSecretCiphertext?: string | null;
    autoReviewWebhookEnabled?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.url !== undefined) {
    const validated = validateAutoReviewWebhookUrl(input.url, env);
    if (!validated.ok) {
      throw new AutoReviewWebhookSettingsError(validated.error);
    }
    patch.autoReviewWebhookUrl = validated.url;
  }

  const touchingSecrets =
    input.secret !== undefined || input.authorizationHeader !== undefined;
  if (touchingSecrets) {
    const current = await loadSecretBundle(workspaceId);
    const next: AutoReviewSecretBundle = { ...current };

    if (input.secret !== undefined) {
      const trimmed = input.secret.trim();
      next.hmacSecret = trimmed || null;
    }
    if (input.authorizationHeader !== undefined) {
      const trimmed = input.authorizationHeader.trim();
      next.authorizationHeader = trimmed || null;
    }

    if (!next.hmacSecret && !next.authorizationHeader) {
      patch.autoReviewWebhookSecretCiphertext = null;
    } else {
      if (!canEncryptWebhookSecret(env)) {
        throw new AutoReviewWebhookSettingsError(
          "BACKSTEROS_SECRET_ENCRYPTION_KEY (or CORE_REPLICATION_SECRET) is required to save an auto-review webhook secret",
        );
      }
      patch.autoReviewWebhookSecretCiphertext = encryptAutoReviewSecretBundle(
        next,
        env,
      );
    }
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
  authorizationHeader?: string | null;
}): Promise<PostResult> {
  const headers = buildAutoReviewHeaders({
    body: input.body,
    timestamp: input.timestamp,
    secret: input.secret,
    deliveryId: input.deliveryId,
    authorizationHeader: input.authorizationHeader,
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
  const {
    recordTaskCommentRestSyncEvent,
    loadTaskActivityRow,
    recordTaskActivityRestSyncEvent,
  } = await import("./sync.js");
  await recordTaskCommentRestSyncEvent(workspaceId, comment, "upsert");
  const activity = await loadTaskActivityRow(workspaceId, comment.id);
  if (activity) {
    await recordTaskActivityRestSyncEvent(workspaceId, activity, "upsert");
  }
}

/** Guard: only the claimer that set this lease may finalize. */
function claimLeaseGuard(
  row: typeof autoReviewWebhookDeliveries.$inferSelect,
) {
  return and(
    eq(autoReviewWebhookDeliveries.id, row.id),
    eq(autoReviewWebhookDeliveries.status, "sending"),
    eq(autoReviewWebhookDeliveries.nextAttemptAt, row.nextAttemptAt),
  );
}

/**
 * Finalize a claimed (`sending`) row. Side effects (activity / failure comment)
 * run only when this UPDATE wins the lease-scoped `sending` → terminal transition.
 */
export async function finalizeDelivery(input: {
  row: typeof autoReviewWebhookDeliveries.$inferSelect;
  result: PostResult;
  payload: AutoReviewReadyPayload;
  /** Test deliveries never stay retryable. */
  forceFailedOnRetry?: boolean;
}): Promise<"delivered" | "pending" | "failed" | "skipped"> {
  const classification = classifyWebhookResponse({
    httpStatus: input.result.httpStatus,
    networkError: input.result.networkError,
    timeout: input.result.timeout,
  });
  const attempt = input.payload.attempt;
  const now = new Date();
  const leaseGuard = claimLeaseGuard(input.row);

  if (classification === "success") {
    const [won] = await db
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
      .where(leaseGuard)
      .returning();
    if (!won) return "skipped";
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

  const treatAsDead =
    classification === "dead" ||
    attempt >= AUTO_REVIEW_MAX_ATTEMPTS ||
    (input.forceFailedOnRetry && classification === "retry") ||
    (Boolean(input.payload.test) && classification === "retry");

  if (treatAsDead) {
    const [won] = await db
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
      .where(leaseGuard)
      .returning();
    if (!won) return "skipped";
    await markTaskDeliveryStatus(
      input.row.workspaceId,
      input.row.taskId,
      "failed",
    );
    if (input.row.taskId && !input.payload.test) {
      await recordFailureComment(input.row.workspaceId, input.row.taskId);
    }
    return "failed";
  }

  const [won] = await db
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
    .where(leaseGuard)
    .returning();
  if (!won) return "skipped";
  return "pending";
}

type CredentialsResult =
  | {
      ok: true;
      url: string;
      secret: string;
      authorizationHeader: string | null;
    }
  | {
      ok: false;
      reason: "disabled" | "not_configured" | "secret_unreadable";
    };

async function credentialsForWorkspace(
  workspaceId: string,
): Promise<CredentialsResult> {
  const [row] = await db
    .select({
      url: workspaceIntegrationSecrets.autoReviewWebhookUrl,
      ciphertext: workspaceIntegrationSecrets.autoReviewWebhookSecretCiphertext,
      enabled: workspaceIntegrationSecrets.autoReviewWebhookEnabled,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  if (!row?.enabled) return { ok: false, reason: "disabled" };
  const url = row.url?.trim() ?? "";
  if (!url) return { ok: false, reason: "not_configured" };
  const hasCiphertext = Boolean(row.ciphertext?.trim());
  const bundle = decryptAutoReviewSecretBundle(row.ciphertext);
  if (!bundle.hmacSecret) {
    return {
      ok: false,
      reason: hasCiphertext ? "secret_unreadable" : "not_configured",
    };
  }
  return {
    ok: true,
    url,
    secret: bundle.hmacSecret,
    authorizationHeader: bundle.authorizationHeader,
  };
}

function unconfiguredError(
  reason: "disabled" | "not_configured" | "secret_unreadable",
): string {
  if (reason === "disabled") return "webhook disabled";
  if (reason === "secret_unreadable") return "webhook secret unreadable";
  return "webhook not configured";
}

/** Mark a claimed row failed because the webhook cannot be delivered. */
async function failUnconfiguredDelivery(input: {
  row: typeof autoReviewWebhookDeliveries.$inferSelect;
  reason: "disabled" | "not_configured" | "secret_unreadable";
  /** Test rows: no task comment. */
  isTest?: boolean;
}): Promise<"failed" | "skipped"> {
  const now = new Date();
  const attempt = Math.max(1, input.row.attempt + 1);
  const [won] = await db
    .update(autoReviewWebhookDeliveries)
    .set({
      status: "failed",
      attempt,
      lastAttemptAt: now,
      lastError: unconfiguredError(input.reason),
      updatedAt: now,
    })
    .where(claimLeaseGuard(input.row))
    .returning();
  if (!won) return "skipped";
  await markTaskDeliveryStatus(
    input.row.workspaceId,
    input.row.taskId,
    "failed",
  );
  if (input.row.taskId && !input.isTest) {
    await recordFailureComment(input.row.workspaceId, input.row.taskId);
  }
  return "failed";
}

async function deliverRow(
  row: typeof autoReviewWebhookDeliveries.$inferSelect,
  options: { forceFailedOnRetry?: boolean } = {},
): Promise<"delivered" | "pending" | "failed" | "skipped"> {
  const creds = await credentialsForWorkspace(row.workspaceId);
  if (!creds.ok) {
    return failUnconfiguredDelivery({
      row,
      reason: creds.reason,
      isTest: Boolean((row.payload as AutoReviewReadyPayload | null)?.test),
    });
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
    authorizationHeader: creds.authorizationHeader,
  });
  return finalizeDelivery({
    row,
    result,
    payload,
    forceFailedOnRetry: options.forceFailedOnRetry ?? Boolean(payload.test),
  });
}

/**
 * Atomically claim due pending (or lease-expired sending) rows before POST.
 */
export async function claimDueAutoReviewWebhookDeliveries(
  now = new Date(),
  limit = AUTO_REVIEW_CLAIM_LIMIT,
): Promise<(typeof autoReviewWebhookDeliveries.$inferSelect)[]> {
  const leaseUntil = new Date(now.getTime() + autoReviewSendLeaseMs(limit));
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(autoReviewWebhookDeliveries)
      .where(
        and(
          or(
            eq(autoReviewWebhookDeliveries.status, "pending"),
            eq(autoReviewWebhookDeliveries.status, "sending"),
          ),
          lte(autoReviewWebhookDeliveries.nextAttemptAt, now),
        ),
      )
      .orderBy(autoReviewWebhookDeliveries.nextAttemptAt)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];

    const claimed: (typeof autoReviewWebhookDeliveries.$inferSelect)[] = [];
    for (const row of due) {
      const [updated] = await tx
        .update(autoReviewWebhookDeliveries)
        .set({
          status: "sending",
          nextAttemptAt: leaseUntil,
          updatedAt: now,
        })
        .where(
          and(
            eq(autoReviewWebhookDeliveries.id, row.id),
            or(
              eq(autoReviewWebhookDeliveries.status, "pending"),
              eq(autoReviewWebhookDeliveries.status, "sending"),
            ),
          ),
        )
        .returning();
      if (updated) claimed.push(updated);
    }
    return claimed;
  });
}

let tickInFlight = false;

export async function runDueAutoReviewWebhookDeliveries(
  now = new Date(),
  limit = AUTO_REVIEW_CLAIM_LIMIT,
): Promise<number> {
  if (!shouldDeliverAutoReviewWebhooks()) return 0;
  if (tickInFlight) return 0;
  tickInFlight = true;
  try {
    const claimed = await claimDueAutoReviewWebhookDeliveries(now, limit);
    let delivered = 0;
    for (const row of claimed) {
      try {
        const outcome = await deliverRow(row);
        if (outcome === "delivered") delivered += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "deliver failed";
        console.warn(`[auto-review] delivery ${row.id} failed:`, message);
        // Leave lease in place; expired sending rows become due again.
      }
    }
    return delivered;
  } finally {
    tickInFlight = false;
  }
}

/** Test helper: clear the in-process tick guard. */
export function resetAutoReviewWebhookTickGuardForTests(): void {
  tickInFlight = false;
}

/**
 * One-shot Send test. Allowed on local-role cores (desktop Settings).
 * POSTs first, then inserts a single terminal outbox row (delivered/failed)
 * so cloud never claims or re-sends it. Background workers stay cloud-only.
 */
export async function sendAutoReviewWebhookTest(
  workspaceId: string,
): Promise<AutoReviewWebhookTestResult> {
  const settings = await getAutoReviewWebhookSettings(workspaceId);
  if (!settings.enabled || !settings.url || !settings.secretConfigured) {
    return {
      ok: false,
      error:
        "Configure URL, secret, and turn the webhook on before sending a test.",
      httpStatus: null,
      deliveryId: null,
    };
  }

  const creds = await credentialsForWorkspace(workspaceId);
  if (!creds.ok) {
    return {
      ok: false,
      error: unconfiguredError(creds.reason),
      httpStatus: null,
      deliveryId: null,
    };
  }

  const deliveryId = newId();
  const now = new Date();
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
    timestamp: now.toISOString(),
    threadId: null,
    sessionId: null,
    commitHashes: [],
    deliveryId,
    attempt: 1,
    test: true,
  };

  const timestampHeader = String(Date.now());
  const body = stableJson(payload);
  const result = await postSignedWebhook({
    url: creds.url,
    secret: creds.secret,
    body,
    timestamp: timestampHeader,
    deliveryId,
    authorizationHeader: creds.authorizationHeader,
  });

  const classification = classifyWebhookResponse({
    httpStatus: result.httpStatus,
    networkError: result.networkError,
    timeout: result.timeout,
  });
  const status = classification === "success" ? "delivered" : "failed";

  await db.insert(autoReviewWebhookDeliveries).values({
    id: deliveryId,
    workspaceId,
    taskId: null,
    event: AUTO_REVIEW_EVENT,
    payload,
    status,
    attempt: 1,
    nextAttemptAt: now,
    lastAttemptAt: now,
    lastHttpStatus: result.httpStatus,
    lastError: result.error,
  });

  return {
    ok: status === "delivered",
    error: result.error,
    httpStatus: result.httpStatus,
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
