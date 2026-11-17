/**
 * OS-181: cloud-side handlers for forwarded API key admin mutations.
 */

import { createApiKeySchema, updateApiKeySchema } from "@backsteros/contracts";

import { extractBearerToken, verifyReplicationSecret } from "./core-replication/auth.js";
import {
  parseKeyAdminAuthHeaders,
  resolveCoreKeyAdminSecret,
  verifyKeyAdminRequest,
} from "../lib/api-key-admin-forward-auth.js";
import { toApiKey } from "../lib/mappers.js";
import { assertWorkspaceOwner } from "./ops.js";
import * as apiKeyService from "./api-keys.js";
import { getCoreReplicationConfig } from "./core-replication/config.js";

export type ApiKeyAdminCloudHandlerResult = {
  status: number;
  body: unknown;
};

function unauthorized(message = "Unauthorized") {
  return {
    status: 401 as const,
    body: { error: message, code: "unauthorized" as const },
  };
}

function forbidden(message = "Forbidden") {
  return {
    status: 403 as const,
    body: { error: message, code: "forbidden" as const },
  };
}

function badRequest(message: string) {
  return {
    status: 400 as const,
    body: { error: message, code: "bad_request" as const },
  };
}

/**
 * Verify dedicated key-admin Bearer + HMAC. Rejects replication-secret-only
 * and any agent/app API key bearer.
 */
export function authenticateKeyAdminForward(input: {
  authorization: string | undefined;
  method: string;
  path: string;
  bodyText: string;
  headerGet: (name: string) => string | null | undefined;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
}):
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; result: ApiKeyAdminCloudHandlerResult } {
  const env = input.env ?? process.env;
  const config = getCoreReplicationConfig(env);
  if (!config || config.role !== "cloud") {
    return { ok: false, result: { status: 404, body: { error: "Not found", code: "not_found" } } };
  }
  const adminSecret = resolveCoreKeyAdminSecret(env);
  if (!adminSecret) {
    return {
      ok: false,
      result: {
        status: 503,
        body: {
          error: "CORE_KEY_ADMIN_SECRET is not configured on cloud",
          code: "api_key_admin_secret_missing",
        },
      },
    };
  }
  const token = extractBearerToken(input.authorization);
  if (!token) {
    return { ok: false, result: unauthorized("Missing key-admin credential") };
  }
  if (verifyReplicationSecret(token, adminSecret)) {
    // Dedicated CORE_KEY_ADMIN_SECRET — continue to HMAC.
  } else if (verifyReplicationSecret(token, config.secret)) {
    return {
      ok: false,
      result: forbidden(
        "Replication secret cannot manage API keys; use CORE_KEY_ADMIN_SECRET",
      ),
    };
  } else {
    return { ok: false, result: unauthorized("Invalid key-admin credential") };
  }

  const headers = parseKeyAdminAuthHeaders({
    [ "x-backsteros-key-admin-user-id"]: input.headerGet("x-backsteros-key-admin-user-id") ?? undefined,
    [ "x-backsteros-key-admin-workspace-id"]:
      input.headerGet("x-backsteros-key-admin-workspace-id") ?? undefined,
    [ "x-backsteros-key-admin-timestamp"]:
      input.headerGet("x-backsteros-key-admin-timestamp") ?? undefined,
    [ "x-backsteros-key-admin-signature"]:
      input.headerGet("x-backsteros-key-admin-signature") ?? undefined,
  });
  if (!headers) {
    return { ok: false, result: unauthorized("Missing key-admin signature headers") };
  }
  const verified = verifyKeyAdminRequest({
    secret: adminSecret,
    method: input.method,
    path: input.path,
    body: input.bodyText,
    headers,
    nowMs: input.nowMs,
  });
  if (!verified.ok) {
    return { ok: false, result: unauthorized(`key-admin auth failed: ${verified.reason}`) };
  }
  return {
    ok: true,
    userId: headers.userId,
    workspaceId: headers.workspaceId,
  };
}

async function requireOwner(
  workspaceId: string,
  userId: string,
): Promise<ApiKeyAdminCloudHandlerResult | null> {
  const ok = await assertWorkspaceOwner(workspaceId, userId, null);
  if (!ok) {
    return forbidden("Only the workspace owner may manage API keys via cloud forward");
  }
  return null;
}

function actor(userId: string): {
  userId: string;
  kind: "local_shell";
  apiKeyId: null;
  address: null;
} {
  return { userId, kind: "local_shell", apiKeyId: null, address: null };
}

export async function handleCloudApiKeyCreate(input: {
  workspaceId: string;
  userId: string;
  json: unknown;
}): Promise<ApiKeyAdminCloudHandlerResult> {
  const denied = await requireOwner(input.workspaceId, input.userId);
  if (denied) return denied;
  const parsed = createApiKeySchema.safeParse(input.json);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
  }
  try {
    const { row, secret } = await apiKeyService.createApiKey(
      input.workspaceId,
      input.userId,
      parsed.data,
      actor(input.userId),
    );
    return {
      status: 201,
      body: { apiKey: toApiKey(row), secret },
    };
  } catch (error) {
    return mapApiKeyServiceError(error);
  }
}

export async function handleCloudApiKeyUpdate(input: {
  workspaceId: string;
  userId: string;
  keyId: string;
  json: unknown;
}): Promise<ApiKeyAdminCloudHandlerResult> {
  const denied = await requireOwner(input.workspaceId, input.userId);
  if (denied) return denied;
  const parsed = updateApiKeySchema.safeParse(input.json);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
  }
  try {
    const row = await apiKeyService.updateApiKey(
      input.workspaceId,
      input.keyId,
      parsed.data,
      actor(input.userId),
    );
    if (!row) {
      return { status: 404, body: { error: "API key not found", code: "not_found" } };
    }
    return { status: 200, body: toApiKey(row) };
  } catch (error) {
    return mapApiKeyServiceError(error);
  }
}

export async function handleCloudApiKeyRotate(input: {
  workspaceId: string;
  userId: string;
  keyId: string;
}): Promise<ApiKeyAdminCloudHandlerResult> {
  const denied = await requireOwner(input.workspaceId, input.userId);
  if (denied) return denied;
  try {
    const rotated = await apiKeyService.rotateApiKey(
      input.workspaceId,
      input.keyId,
      actor(input.userId),
    );
    if (!rotated) {
      return { status: 404, body: { error: "API key not found", code: "not_found" } };
    }
    return {
      status: 200,
      body: { apiKey: toApiKey(rotated.row), secret: rotated.secret },
    };
  } catch (error) {
    return mapApiKeyServiceError(error);
  }
}

export async function handleCloudApiKeyRevoke(input: {
  workspaceId: string;
  userId: string;
  keyId: string;
}): Promise<ApiKeyAdminCloudHandlerResult> {
  const denied = await requireOwner(input.workspaceId, input.userId);
  if (denied) return denied;
  const row = await apiKeyService.revokeApiKey(
    input.workspaceId,
    input.keyId,
    actor(input.userId),
  );
  if (!row) {
    return { status: 404, body: { error: "API key not found", code: "not_found" } };
  }
  return { status: 200, body: toApiKey(row) };
}

function mapApiKeyServiceError(error: unknown): ApiKeyAdminCloudHandlerResult {
  if (!(error instanceof Error)) {
    return { status: 500, body: { error: "Internal error", code: "internal" } };
  }
  if (error.message === "CONTACT_NOT_FOUND") {
    return { status: 404, body: { error: "Contact not found", code: "not_found" } };
  }
  if (error.message === "AGENT_CONTACT_REQUIRED") {
    return badRequest("Agent keys require a contact");
  }
  if (error.message === "AGENT_SCOPES_REQUIRED") {
    return badRequest(
      "Agent keys need at least one non-door scope (settings:write is not allowed)",
    );
  }
  if (
    error.message === "INVALID_EXPIRES_AT" ||
    error.message === "EXPIRES_AT_IN_PAST" ||
    error.message === "EXPIRES_AT_BEYOND_ACTOR"
  ) {
    return badRequest("Invalid expiresAt");
  }
  if (error.message === "API_KEY_EXPIRED") {
    return badRequest("Cannot rotate an expired key; extend or clear expiresAt first");
  }
  if (error.message === "CONTACT_CLEAR_FORBIDDEN") {
    return badRequest("Cannot clear contact on an API key");
  }
  return { status: 500, body: { error: error.message, code: "internal" } };
}
