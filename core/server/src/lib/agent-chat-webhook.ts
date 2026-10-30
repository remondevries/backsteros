/**
 * Outbound webhook helpers for shell agent chat (OS-150 / OS-151).
 * Reuses AES-GCM encryption from auto-review webhooks.
 */
import { randomBytes } from "node:crypto";

import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  validateAutoReviewWebhookUrl,
} from "./auto-review-webhook.js";

export const AGENT_CHAT_WEBHOOK_EVENT = "agent.chat.message" as const;
export const AGENT_CHAT_WEBHOOK_TIMEOUT_MS = 10_000;

/** Auth secret header Grok Bot verifies on inbound POSTs. */
export const AGENT_CHAT_WEBHOOK_SECRET_HEADER =
  "x-backsteros-webhook-secret" as const;

export const AGENT_CHAT_DELIVERY_ID_HEADER =
  "x-backsteros-delivery-id" as const;

export {
  encryptWebhookSecret as encryptAgentChatWebhookSecret,
  decryptWebhookSecret as decryptAgentChatWebhookSecret,
  validateAutoReviewWebhookUrl as validateAgentChatWebhookUrl,
};

export function generateAgentChatWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export type AgentChatWebhookMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
};

export type AgentChatWebhookPayload = {
  event: typeof AGENT_CHAT_WEBHOOK_EVENT;
  workspaceId: string;
  agentId: string;
  agentName: string;
  threadId: string;
  message: AgentChatWebhookMessage;
  /** Last ~10 messages including the new one (oldest → newest). */
  context: AgentChatWebhookMessage[];
  deliveryId: string;
  timestamp: string;
};

export function buildAgentChatWebhookHeaders(input: {
  secret: string | null;
  deliveryId: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [AGENT_CHAT_DELIVERY_ID_HEADER]: input.deliveryId,
  };
  if (input.secret) {
    headers[AGENT_CHAT_WEBHOOK_SECRET_HEADER] = input.secret;
    // Convenience alias many bots already accept.
    headers.authorization = `Bearer ${input.secret}`;
  }
  return headers;
}
