import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const AUTO_REVIEW_EVENT = "task.ready_for_review" as const;
export const AUTO_REVIEW_TIMEOUT_MS = 10_000;
export const AUTO_REVIEW_MAX_ATTEMPTS = 6;
/** Lease held while a worker is POSTing; expired `sending` rows become due again. */
export const AUTO_REVIEW_SEND_LEASE_MS = 2 * 60_000;

/** Delay before attempts 2–6 (after a failed attempt 1…5). */
export const AUTO_REVIEW_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

export const AUTO_REVIEW_SIGNATURE_HEADER = "x-backsteros-signature";
export const AUTO_REVIEW_TIMESTAMP_HEADER = "x-backsteros-timestamp";
export const AUTO_REVIEW_DELIVERY_ID_HEADER = "x-backsteros-delivery-id";

export type AutoReviewReadyPayload = {
  event: typeof AUTO_REVIEW_EVENT;
  taskId: string;
  taskKey: string;
  title: string;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  timestamp: string;
  threadId: string | null;
  sessionId: string | null;
  commitHashes: string[];
  deliveryId: string;
  attempt: number;
  test?: boolean;
};

export type AutoReviewDeliveryStatus = "pending" | "sending" | "delivered" | "failed";

/** Task-facing / settings-facing status — never expose `sending`. */
export function mapAutoReviewDeliveryStatusForApi(
  status: string | null | undefined,
): "pending" | "delivered" | "failed" | null {
  if (status === "sending") return "pending";
  if (status === "pending" || status === "delivered" || status === "failed") {
    return status;
  }
  return null;
}

export function shouldEnqueueAutoReview(input: {
  skipActivitySideEffects: boolean;
  webhookEnabled: boolean;
  automateCompletion: boolean;
  previousStatus: string;
  nextStatus: string;
}): boolean {
  if (input.skipActivitySideEffects) return false;
  if (!input.webhookEnabled) return false;
  if (!input.automateCompletion) return false;
  if (input.nextStatus !== "in_review") return false;
  if (input.previousStatus === "in_review") return false;
  return true;
}

export function backoffMsAfterAttempt(failedAttempt: number): number {
  const index = Math.max(0, failedAttempt - 1);
  return AUTO_REVIEW_BACKOFF_MS[
    Math.min(index, AUTO_REVIEW_BACKOFF_MS.length - 1)
  ]!;
}

export type WebhookRetryClass = "success" | "retry" | "dead";

export function classifyWebhookResponse(input: {
  httpStatus: number | null;
  networkError: boolean;
  timeout: boolean;
}): WebhookRetryClass {
  if (input.timeout || input.networkError) return "retry";
  const status = input.httpStatus;
  if (status == null) return "retry";
  if (status >= 200 && status < 300) return "success";
  if (status === 408 || status === 429) return "retry";
  if (status >= 400 && status < 500) return "dead";
  return "retry";
}

export function parseRetryAfterMs(
  header: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!header?.trim()) return null;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}

export function nextAttemptAt(input: {
  failedAttempt: number;
  retryAfterMs: number | null;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();
  const backoff = backoffMsAfterAttempt(input.failedAttempt);
  const delay =
    input.retryAfterMs != null
      ? Math.max(backoff, input.retryAfterMs)
      : backoff;
  return new Date(now.getTime() + delay);
}

export function maskWebhookSecret(secret: string | null | undefined): string | null {
  const trimmed = secret?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function previewWebhookUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.host || trimmed.slice(0, 48);
  } catch {
    return trimmed.slice(0, 48);
  }
}

const DEV_FALLBACK_KEY = "backsteros-dev-auto-review";

export function webhookEncryptionKeyMaterial(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const primary = env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim();
  if (primary) return primary;
  const secondary = env.CORE_REPLICATION_SECRET?.trim();
  if (secondary) return secondary;
  return null;
}

/** Production / cloud cores must not encrypt with the public dev constant. */
export function requiresConfiguredWebhookEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") return true;
  return false;
}

export function canEncryptWebhookSecret(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (webhookEncryptionKeyMaterial(env)) return true;
  return !requiresConfiguredWebhookEncryptionKey(env);
}

function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const material = webhookEncryptionKeyMaterial(env);
  if (material) {
    return createHash("sha256").update(material).digest();
  }
  if (requiresConfiguredWebhookEncryptionKey(env)) {
    throw new Error(
      "BACKSTEROS_SECRET_ENCRYPTION_KEY (or CORE_REPLICATION_SECRET) is required to encrypt auto-review webhook secrets in production/cloud",
    );
  }
  return createHash("sha256").update(DEV_FALLBACK_KEY).digest();
}

export function encryptWebhookSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!canEncryptWebhookSecret(env)) {
    throw new Error(
      "BACKSTEROS_SECRET_ENCRYPTION_KEY (or CORE_REPLICATION_SECRET) is required to save an auto-review webhook secret",
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

let decryptFailureWarned = false;

export function decryptWebhookSecret(
  ciphertext: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = ciphertext?.trim() ?? "";
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const data = Buffer.from(parts[3]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    if (!decryptFailureWarned) {
      decryptFailureWarned = true;
      console.warn(
        "[auto-review] webhook secret decrypt failed (wrong or rotated encryption key); treating as not configured",
      );
    }
    return null;
  }
}

/** Reset the one-shot decrypt warning (unit tests). */
export function resetDecryptFailureWarnedForTests(): void {
  decryptFailureWarned = false;
}

export function isLocalhostHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Empty string clears the URL. Otherwise require absolute https://
 * (http:// only for localhost in non-production).
 */
export function validateAutoReviewWebhookUrl(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const trimmed = url.trim();
  if (!trimmed) return { ok: true, url: null };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Webhook URL must be an absolute http(s) URL" };
  }
  if (parsed.protocol === "https:") {
    return { ok: true, url: trimmed };
  }
  if (
    parsed.protocol === "http:" &&
    isLocalhostHostname(parsed.hostname) &&
    env.NODE_ENV !== "production"
  ) {
    return { ok: true, url: trimmed };
  }
  return {
    ok: false,
    error:
      "Webhook URL must use https:// (http:// allowed only for localhost in development)",
  };
}

export function signAutoReviewBody(input: {
  body: string;
  timestamp: string;
  secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
}

export function verifyAutoReviewSignature(input: {
  body: string;
  timestamp: string;
  secret: string;
  signature: string;
}): boolean {
  const expected = signAutoReviewBody(input);
  const got = input.signature.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(got, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Signed delivery headers. The HMAC key is never sent in Authorization (or
 * any other header) — receivers verify X-BacksterOS-Signature.
 */
export function buildAutoReviewHeaders(input: {
  body: string;
  timestamp: string;
  secret: string;
  deliveryId: string;
}): Record<string, string> {
  const signature = signAutoReviewBody(input);
  return {
    "content-type": "application/json",
    [AUTO_REVIEW_TIMESTAMP_HEADER]: input.timestamp,
    [AUTO_REVIEW_SIGNATURE_HEADER]: `sha256=${signature}`,
    [AUTO_REVIEW_DELIVERY_ID_HEADER]: input.deliveryId,
  };
}

/**
 * Deliver only from standalone cores (no peer config) or explicit cloud role.
 * Mirrors getCoreReplicationConfig(): PEER_URL+SECRET with an unset role is
 * treated as local, so a local core without CORE_REPLICATION_ROLE must not send.
 */
export function shouldDeliverAutoReviewWebhooks(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const peerUrl = env.CORE_REPLICATION_PEER_URL?.trim();
  const secret = env.CORE_REPLICATION_SECRET?.trim();
  if (!peerUrl || !secret) return true;
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud";
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
