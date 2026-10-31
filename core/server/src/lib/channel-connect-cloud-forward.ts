/**
 * Local-core → cloud-core forward for Channel Connect webhooks.
 *
 * Agent webhook URL + secret ciphertext are not replicated. Connect on
 * local-core must ask cloud (where secrets live) to POST the outbound webhook.
 */
import type { ChannelConnectWebhookPayload } from "./channel-connect-webhook.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";

const FORWARD_TIMEOUT_MS = 15_000;

export function shouldForwardChannelConnectWebhookToCloud(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = getCoreReplicationConfig(env);
  return config?.role === "local";
}

export class ChannelConnectCloudForwardError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ChannelConnectCloudForwardError";
    this.status = status;
  }
}

async function peerFetch(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    throw new ChannelConnectCloudForwardError(
      "Channel Connect cloud forward requires CORE_REPLICATION_ROLE=local with a peer",
      500,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    return await fetchImpl(`${config.peerUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.secret}`,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Cloud-core Channel Connect forward timed out"
        : error instanceof Error
          ? error.message
          : "Cloud-core Channel Connect forward failed";
    throw new ChannelConnectCloudForwardError(message, 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask cloud-core to resolve lead/global webhook secrets and POST the event.
 * Never logs the secret.
 */
export async function forwardChannelConnectWebhookToCloud(input: {
  workspaceId: string;
  payload: ChannelConnectWebhookPayload;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await peerFetch(
      "/internal/core-replication/channel-connect-webhook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: input.workspaceId,
          payload: input.payload,
        }),
      },
      input.fetchImpl,
    );
    const text = await response.text().catch(() => "");
    let body: { ok?: boolean; error?: string } | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as { ok?: boolean; error?: string };
      } catch {
        body = null;
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        error:
          body?.error?.trim() ||
          `Cloud-core Channel Connect forward returned HTTP ${response.status}`,
      };
    }
    if (body?.ok === false) {
      return {
        ok: false,
        error: body.error?.trim() || "Cloud-core Channel Connect webhook failed",
      };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof ChannelConnectCloudForwardError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Cloud-core Channel Connect forward failed",
    };
  }
}
