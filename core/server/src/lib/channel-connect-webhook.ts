/**
 * Outbound Channel Connect webhook (Niels Grok Bot routine).
 * Prefer the project's lead agent webhook; fall back to workspace/env global.
 * URL + secret never hard-coded, never logged.
 *
 * On hybrid local-core, agent webhook ciphertext is not replicated — forward
 * the Connect POST to cloud-core (where secrets live) instead of resolving
 * locally.
 */
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { agents, workspaceIntegrationSecrets } from "../db/schema.js";
import { logger } from "./logger.js";
import { validateAutoReviewWebhookUrl } from "./auto-review-webhook.js";
import {
  AGENT_CHAT_WEBHOOK_SECRET_HEADER,
  buildAgentChatWebhookHeaders,
  decryptAgentChatWebhookSecret,
} from "./agent-chat-webhook.js";
import {
  forwardChannelConnectWebhookToCloud,
  shouldForwardChannelConnectWebhookToCloud,
} from "./channel-connect-cloud-forward.js";

export const CHANNEL_CONNECT_WEBHOOK_EVENT = "project.channel.connect" as const;
export const CHANNEL_CONNECT_WEBHOOK_TIMEOUT_MS = 10_000;
/** Same secret header as agent chat (Cursor automations accept Bearer too). */
export const CHANNEL_CONNECT_WEBHOOK_SECRET_HEADER =
  AGENT_CHAT_WEBHOOK_SECRET_HEADER;

export type ChannelConnectWebhookPayload = {
  event: typeof CHANNEL_CONNECT_WEBHOOK_EVENT;
  projectId: string;
  projectKey: string;
  projectName: string;
  type: string;
  requestedAt: string;
  leadAgentContactId: string | null;
};

export type ChannelConnectWebhookConfig = {
  url: string;
  secret: string;
};

async function resolveLeadAgentWebhookConfig(
  workspaceId: string,
  leadAgentContactId: string | null | undefined,
): Promise<ChannelConnectWebhookConfig | null> {
  const contactId = leadAgentContactId?.trim() || "";
  if (!contactId) return null;
  try {
    const [row] = await db
      .select({
        webhookUrl: agents.webhookUrl,
        webhookSecretCiphertext: agents.webhookSecretCiphertext,
      })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.contactId, contactId),
          eq(agents.enabled, true),
        ),
      )
      .limit(1);
    const url = row?.webhookUrl?.trim() || "";
    if (!url || !row?.webhookSecretCiphertext?.trim()) return null;
    const secret = decryptAgentChatWebhookSecret(row.webhookSecretCiphertext);
    if (!secret?.trim()) return null;
    const checked = validateAutoReviewWebhookUrl(url);
    if (!checked.ok || !checked.url) return null;
    return { url: checked.url, secret };
  } catch {
    return null;
  }
}

async function resolveGlobalChannelConnectWebhookConfig(
  workspaceId: string,
): Promise<ChannelConnectWebhookConfig | null> {
  const envUrl = process.env.CHANNEL_CONNECT_WEBHOOK_URL?.trim() || "";
  const envSecret = process.env.CHANNEL_CONNECT_WEBHOOK_SECRET?.trim() || "";
  if (envUrl && envSecret) {
    const checked = validateAutoReviewWebhookUrl(envUrl);
    if (!checked.ok || !checked.url) return null;
    return { url: checked.url, secret: envSecret };
  }

  try {
    const [row] = await db
      .select({
        url: workspaceIntegrationSecrets.channelConnectWebhookUrl,
        secret: workspaceIntegrationSecrets.channelConnectWebhookSecret,
      })
      .from(workspaceIntegrationSecrets)
      .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
      .limit(1);

    const url = row?.url?.trim() || "";
    const secret = row?.secret?.trim() || "";
    if (!url || !secret) return null;
    const checked = validateAutoReviewWebhookUrl(url);
    if (!checked.ok || !checked.url) return null;
    return { url: checked.url, secret };
  } catch {
    // Pre-migration or missing columns → treat as unset (never log secret).
    return null;
  }
}

/**
 * Resolve URL+secret: lead agent webhook first, then env / workspace global.
 * Never log secret.
 */
export async function resolveChannelConnectWebhookConfig(
  workspaceId: string,
  leadAgentContactId?: string | null,
): Promise<ChannelConnectWebhookConfig | null> {
  const lead = await resolveLeadAgentWebhookConfig(
    workspaceId,
    leadAgentContactId,
  );
  if (lead) return lead;
  return resolveGlobalChannelConnectWebhookConfig(workspaceId);
}

export async function postChannelConnectWebhook(
  input: {
    workspaceId: string;
    payload: ChannelConnectWebhookPayload;
    fetchImpl?: typeof fetch;
    /** Test/inject override — never log. */
    configOverride?: ChannelConnectWebhookConfig | null;
    /**
     * When true, skip local→cloud forward (cloud internal handler).
     * Tests that inject configOverride also skip forward.
     */
    skipCloudForward?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    input.configOverride === undefined &&
    !input.skipCloudForward &&
    shouldForwardChannelConnectWebhookToCloud()
  ) {
    return forwardChannelConnectWebhookToCloud({
      workspaceId: input.workspaceId,
      payload: input.payload,
      fetchImpl: input.fetchImpl,
    });
  }

  const config =
    input.configOverride !== undefined
      ? input.configOverride
      : await resolveChannelConnectWebhookConfig(
          input.workspaceId,
          input.payload.leadAgentContactId,
        );
  if (!config) {
    return {
      ok: false,
      error:
        "Channel Connect webhook is not configured (set the lead agent's webhook, or CHANNEL_CONNECT_WEBHOOK_URL + CHANNEL_CONNECT_WEBHOOK_SECRET).",
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const deliveryId = `channel-connect:${input.payload.projectId}:${input.payload.requestedAt}`;
  // Same auth as agent chat → Cursor automations (Bearer + secret header).
  const headers = buildAgentChatWebhookHeaders({
    secret: config.secret,
    deliveryId,
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CHANNEL_CONNECT_WEBHOOK_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        { status: response.status, projectId: input.payload.projectId },
        "channel connect webhook non-2xx",
      );
      return {
        ok: false,
        error: `Channel Connect webhook returned HTTP ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Channel Connect webhook timed out"
        : "Channel Connect webhook request failed";
    logger.warn(
      { projectId: input.payload.projectId, err: message },
      "channel connect webhook error",
    );
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
