/**
 * Local-core → cloud-core forward for shell agent chat webhooks.
 *
 * Agent webhook URL + secret ciphertext are not replicated. When a human
 * message is posted on local-core, ask cloud (where secrets live) to POST the
 * outbound `agent.chat.message` / `agent.webhook.test` webhook.
 */
import type { AgentOutboundWebhookPayload } from "./agent-chat-webhook.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";

const FORWARD_TIMEOUT_MS = 15_000;

export function shouldForwardAgentChatWebhookToCloud(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = getCoreReplicationConfig(env);
  return config?.role === "local";
}

export class AgentChatCloudForwardError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentChatCloudForwardError";
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
    throw new AgentChatCloudForwardError(
      "Agent chat cloud forward requires CORE_REPLICATION_ROLE=local with a peer",
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
        ? "Cloud-core agent chat forward timed out"
        : error instanceof Error
          ? error.message
          : "Cloud-core agent chat forward failed";
    throw new AgentChatCloudForwardError(message, 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask cloud-core to resolve agent webhook secrets and POST the event.
 * Never logs the secret.
 */
export async function forwardAgentChatWebhookToCloud(input: {
  workspaceId: string;
  agentId: string;
  payload: AgentOutboundWebhookPayload;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; error: null } | { ok: false; error: string }> {
  try {
    const response = await peerFetch(
      "/internal/core-replication/agent-chat-webhook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: input.workspaceId,
          agent_id: input.agentId,
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
          `Cloud-core agent chat forward returned HTTP ${response.status}`,
      };
    }
    if (body?.ok === false) {
      return {
        ok: false,
        error: body.error?.trim() || "Cloud-core agent chat webhook failed",
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof AgentChatCloudForwardError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Cloud-core agent chat forward failed",
    };
  }
}
