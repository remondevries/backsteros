/**
 * OS-181: HMAC auth for local→cloud API key admin forwards.
 *
 * Dedicated secret CORE_KEY_ADMIN_SECRET (never an agent key). Signature binds
 * method, path, acting user id, workspace id, timestamp, and body hash.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const CORE_KEY_ADMIN_SECRET_ENV = "CORE_KEY_ADMIN_SECRET";

export const KEY_ADMIN_USER_HEADER = "x-backsteros-key-admin-user-id";
export const KEY_ADMIN_WORKSPACE_HEADER = "x-backsteros-key-admin-workspace-id";
export const KEY_ADMIN_TIMESTAMP_HEADER = "x-backsteros-key-admin-timestamp";
export const KEY_ADMIN_SIGNATURE_HEADER = "x-backsteros-key-admin-signature";

/** ±5 minutes. */
export const KEY_ADMIN_MAX_SKEW_MS = 5 * 60_000;

export function resolveCoreKeyAdminSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env[CORE_KEY_ADMIN_SECRET_ENV]?.trim();
  return raw || null;
}

export function hashKeyAdminBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function buildKeyAdminSigningPayload(input: {
  method: string;
  path: string;
  userId: string;
  workspaceId: string;
  timestampMs: number;
  body: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.userId,
    input.workspaceId,
    String(input.timestampMs),
    hashKeyAdminBody(input.body),
  ].join("\n");
}

export function signKeyAdminRequest(
  secret: string,
  input: {
    method: string;
    path: string;
    userId: string;
    workspaceId: string;
    timestampMs: number;
    body: string;
  },
): string {
  return createHmac("sha256", secret)
    .update(buildKeyAdminSigningPayload(input), "utf8")
    .digest("base64url");
}

function safeEqualUtf8(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type KeyAdminAuthHeaders = {
  userId: string;
  workspaceId: string;
  timestampMs: number;
  signature: string;
};

export function parseKeyAdminAuthHeaders(
  headers: Headers | Record<string, string | undefined>,
): KeyAdminAuthHeaders | null {
  const get = (name: string): string => {
    if (headers instanceof Headers) {
      return headers.get(name)?.trim() ?? "";
    }
    const direct = headers[name] ?? headers[name.toLowerCase()];
    return typeof direct === "string" ? direct.trim() : "";
  };
  const userId = get(KEY_ADMIN_USER_HEADER);
  const workspaceId = get(KEY_ADMIN_WORKSPACE_HEADER);
  const timestampRaw = get(KEY_ADMIN_TIMESTAMP_HEADER);
  const signature = get(KEY_ADMIN_SIGNATURE_HEADER);
  const timestampMs = Number(timestampRaw);
  if (
    !userId ||
    !workspaceId ||
    !signature ||
    !Number.isFinite(timestampMs) ||
    timestampMs <= 0
  ) {
    return null;
  }
  return { userId, workspaceId, timestampMs, signature };
}

export function verifyKeyAdminRequest(input: {
  secret: string;
  method: string;
  path: string;
  body: string;
  headers: KeyAdminAuthHeaders;
  nowMs?: number;
  maxSkewMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const nowMs = input.nowMs ?? Date.now();
  const maxSkewMs = input.maxSkewMs ?? KEY_ADMIN_MAX_SKEW_MS;
  if (Math.abs(nowMs - input.headers.timestampMs) > maxSkewMs) {
    return { ok: false, reason: "timestamp skew" };
  }
  const expected = signKeyAdminRequest(input.secret, {
    method: input.method,
    path: input.path,
    userId: input.headers.userId,
    workspaceId: input.headers.workspaceId,
    timestampMs: input.headers.timestampMs,
    body: input.body,
  });
  if (!safeEqualUtf8(expected, input.headers.signature)) {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true };
}

export function keyAdminAuthHeaderRecord(input: {
  secret: string;
  method: string;
  path: string;
  userId: string;
  workspaceId: string;
  body: string;
  timestampMs?: number;
}): Record<string, string> {
  const timestampMs = input.timestampMs ?? Date.now();
  const signature = signKeyAdminRequest(input.secret, {
    method: input.method,
    path: input.path,
    userId: input.userId,
    workspaceId: input.workspaceId,
    timestampMs,
    body: input.body,
  });
  return {
    Authorization: `Bearer ${input.secret}`,
    [KEY_ADMIN_USER_HEADER]: input.userId,
    [KEY_ADMIN_WORKSPACE_HEADER]: input.workspaceId,
    [KEY_ADMIN_TIMESTAMP_HEADER]: String(timestampMs),
    [KEY_ADMIN_SIGNATURE_HEADER]: signature,
  };
}
