/**
 * Outbound Channel Connect webhook (Niels Grok Bot routine).
 * URL + secret from workspace settings and/or env — never hard-coded, never logged.
 */
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import { logger } from "./logger.js";
import { validateAutoReviewWebhookUrl } from "./auto-review-webhook.js";

export const CHANNEL_CONNECT_WEBHOOK_EVENT = "project.channel.connect" as const;
export const CHANNEL_CONNECT_WEBHOOK_TIMEOUT_MS = 10_000;
export const CHANNEL_CONNECT_WEBHOOK_SECRET_HEADER =
  "x-backsteros-webhook-secret" as const;

export type ChannelConnectWebhookPayload = {
  event: typeof CHANNEL_CONNECT_WEBHOOK_EVENT;
  projectId: string;
  projectKey: string;
  projectName: string;
  type: string;
  requestedAt: string;
};

export type ChannelConnectWebhookConfig = {
  url: string;
  secret: string;
};

/** Resolve URL+secret: env overrides workspace secrets. Never log secret. */
export async function resolveChannelConnectWebhookConfig(
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

export async function postChannelConnectWebhook(
  input: {
    workspaceId: string;
    payload: ChannelConnectWebhookPayload;
    fetchImpl?: typeof fetch;
    /** Test/inject override — never log. */
    configOverride?: ChannelConnectWebhookConfig | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config =
    input.configOverride !== undefined
      ? input.configOverride
      : await resolveChannelConnectWebhookConfig(input.workspaceId);
  if (!config) {
    return {
      ok: false,
      error:
        "Channel Connect webhook is not configured (set CHANNEL_CONNECT_WEBHOOK_URL + CHANNEL_CONNECT_WEBHOOK_SECRET or workspace settings).",
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CHANNEL_CONNECT_WEBHOOK_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CHANNEL_CONNECT_WEBHOOK_SECRET_HEADER]: config.secret,
      },
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
