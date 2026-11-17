/**
 * OS-181: HMAC auth for local→cloud API key admin forwards.
 *
 * Dedicated secret CORE_KEY_ADMIN_SECRET (never an agent key). Signature binds
 * method, path, acting user id, workspace id, timestamp, and body hash.
 * The secret itself is never sent as a Bearer token — only the HMAC proves it.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const CORE_KEY_ADMIN_SECRET_ENV = "CORE_KEY_ADMIN_SECRET";
/** Fixed Authorization marker; the real secret never travels on the wire. */
export const KEY_ADMIN_BEARER_MARKER = "key-admin";
export const CORE_KEY_ADMIN_SECRET_MIN_LENGTH = 32;

export const KEY_ADMIN_USER_HEADER = "x-backsteros-key-admin-user-id";
export const KEY_ADMIN_WORKSPACE_HEADER = "x-backsteros-key-admin-workspace-id";
export const KEY_ADMIN_TIMESTAMP_HEADER = "x-backsteros-key-admin-timestamp";
export const KEY_ADMIN_SIGNATURE_HEADER = "x-backsteros-key-admin-signature";

/** ±5 minutes. */
export const KEY_ADMIN_MAX_SKEW_MS = 5 * 60_000;

export type CoreKeyAdminSecretInspection =
  | { ok: true; secret: string }
  | {
      ok: false;
      reason: "missing" | "too_short" | "equals_replication_secret";
    };

/**
 * Resolve and validate CORE_KEY_ADMIN_SECRET. Refuses short secrets and
 * secrets equal to CORE_REPLICATION_SECRET (fail closed).
 */
export function inspectCoreKeyAdminSecret(
  env: NodeJS.ProcessEnv = process.env,
): CoreKeyAdminSecretInspection {
  const raw = env[CORE_KEY_ADMIN_SECRET_ENV]?.trim();
  if (!raw) {
    return { ok: false, reason: "missing" };
  }
  if (Buffer.byteLength(raw, "utf8") < CORE_KEY_ADMIN_SECRET_MIN_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  const replication = env.CORE_REPLICATION_SECRET?.trim();
  if (replication && raw === replication) {
    return { ok: false, reason: "equals_replication_secret" };
  }
  return { ok: true, secret: raw };
}

export function resolveCoreKeyAdminSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const inspected = inspectCoreKeyAdminSecret(env);
  return inspected.ok ? inspected.secret : null;
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
    Authorization: `Bearer ${KEY_ADMIN_BEARER_MARKER}`,
    [KEY_ADMIN_USER_HEADER]: input.userId,
    [KEY_ADMIN_WORKSPACE_HEADER]: input.workspaceId,
    [KEY_ADMIN_TIMESTAMP_HEADER]: String(timestampMs),
    [KEY_ADMIN_SIGNATURE_HEADER]: signature,
  };
}

/** Build a cloud key-admin path with encoded key id. */
export function cloudApiKeyAdminPath(
  keyId: string,
  action?: "rotate" | "revoke",
): string {
  const enc = encodeURIComponent(keyId);
  if (action) {
    return `/internal/core-replication/api-keys/${enc}/${action}`;
  }
  return `/internal/core-replication/api-keys/${enc}`;
}

/**
 * True when a cloud peer URL is set but ROLE is unset — hybrid Macs would
 * silently mint Mac-only keys.
 */
export function shouldWarnReplicationRoleUnset(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const peer = env.CORE_REPLICATION_PEER_URL?.trim();
  const role = env.CORE_REPLICATION_ROLE?.trim();
  return Boolean(peer) && !role;
}
