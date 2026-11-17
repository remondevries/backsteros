/**
 * OS-181: local-core → cloud-core forward for API key admin mutations.
 *
 * Fail closed when role≠local, peer missing, or CORE_KEY_ADMIN_SECRET unset.
 * Dynamic Island pair stays local (callers must not use this helper).
 */

import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import {
  keyAdminAuthHeaderRecord,
  resolveCoreKeyAdminSecret,
} from "./api-key-admin-forward-auth.js";

const FORWARD_TIMEOUT_MS = 30_000;

export function shouldForwardApiKeyAdminToCloud(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "local";
}

export class ApiKeyAdminCloudForwardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status = 503,
    code = "api_key_cloud_unavailable",
  ) {
    super(message);
    this.name = "ApiKeyAdminCloudForwardError";
    this.status = status;
    this.code = code;
  }
}

/** Clear Settings-facing message when cloud / env is missing. */
export const API_KEY_CLOUD_UNAVAILABLE_MESSAGE =
  "Cloud unreachable — can't create or manage API keys offline. Check Tailscale and CORE_KEY_ADMIN_SECRET.";

export type ApiKeyAdminForwardResult = {
  status: number;
  body: unknown;
};

export async function forwardApiKeyAdminToCloud(input: {
  method: "POST" | "PATCH";
  /** Path on the cloud peer, e.g. /internal/core-replication/api-keys */
  path: string;
  userId: string;
  workspaceId: string;
  body: unknown;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}): Promise<ApiKeyAdminForwardResult> {
  const env = input.env ?? process.env;
  if (!shouldForwardApiKeyAdminToCloud(env)) {
    throw new ApiKeyAdminCloudForwardError(
      API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
      503,
      "api_key_cloud_unavailable",
    );
  }
  const secret = resolveCoreKeyAdminSecret(env);
  if (!secret) {
    throw new ApiKeyAdminCloudForwardError(
      API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
      503,
      "api_key_admin_secret_missing",
    );
  }
  const config = getCoreReplicationConfig(env);
  if (!config || config.role !== "local" || !config.peerUrl) {
    throw new ApiKeyAdminCloudForwardError(
      API_KEY_CLOUD_UNAVAILABLE_MESSAGE,
      503,
      "api_key_cloud_unavailable",
    );
  }

  const bodyText = JSON.stringify(input.body ?? {});
  const headers = keyAdminAuthHeaderRecord({
    secret,
    method: input.method,
    path: input.path,
    userId: input.userId,
    workspaceId: input.workspaceId,
    body: bodyText,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.peerUrl}${input.path}`, {
      method: input.method,
      signal: controller.signal,
      headers: {
        ...headers,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: bodyText,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Cloud-core API key admin timed out"
        : API_KEY_CLOUD_UNAVAILABLE_MESSAGE;
    throw new ApiKeyAdminCloudForwardError(message, 502, "api_key_cloud_unavailable");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { error: text || `HTTP ${response.status}` };
    }
  }
  return { status: response.status, body: parsed };
}
