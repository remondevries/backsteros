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

function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw =
    env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim() ||
    env.CORE_REPLICATION_SECRET?.trim() ||
    "backsteros-dev-auto-review";
  return createHash("sha256").update(raw).digest();
}

export function encryptWebhookSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptWebhookSecret(
  ciphertext: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = ciphertext?.trim() ?? "";
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const data = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export function authorizationHeaderFromSecret(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return "";
  if (/^bearer\s+/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
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

export function buildAutoReviewHeaders(input: {
  body: string;
  timestamp: string;
  secret: string;
  deliveryId: string;
}): Record<string, string> {
  const signature = signAutoReviewBody(input);
  return {
    "content-type": "application/json",
    authorization: authorizationHeaderFromSecret(input.secret),
    [AUTO_REVIEW_TIMESTAMP_HEADER]: input.timestamp,
    [AUTO_REVIEW_SIGNATURE_HEADER]: `sha256=${signature}`,
    [AUTO_REVIEW_DELIVERY_ID_HEADER]: input.deliveryId,
  };
}

export function shouldDeliverAutoReviewWebhooks(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() !== "local";
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
