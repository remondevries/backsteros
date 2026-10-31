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
import { resolveAgentsPublicBase } from "./agents-public-url.js";

/** Human message in an existing shell chat thread. */
export const AGENT_CHAT_WEBHOOK_EVENT = "agent.chat.message" as const;

/**
 * Settings → Test connection ping. Agents must match on this event name —
 * never on message text — and may POST a welcome reply to `replyUrl`.
 */
export const AGENT_WEBHOOK_TEST_EVENT = "agent.webhook.test" as const;

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

export type AgentChatWebhookMention = {
  kind: string;
  raw: string;
  resolved: boolean;
  id?: string | null;
  displayId?: string | null;
  title?: string | null;
  status?: string | null;
  path?: string | null;
};

export type AgentChatWebhookChoicesOption = {
  label: string;
  value: string;
  style?: "default" | "primary" | "danger";
};

export type AgentChatWebhookChoices = {
  prompt?: string;
  multiSelect: boolean;
  options: AgentChatWebhookChoicesOption[];
};

export type AgentChatWebhookChoicesAnswer = {
  values: string[];
  answeredAt: string;
};

export type AgentChatWebhookMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  /** Resolved `[@kind:…]` embeds from `text` (additive; body stays raw). */
  mentions?: AgentChatWebhookMention[];
  /** Assistant-only interactive options (when present on context messages). */
  choices?: AgentChatWebhookChoices;
  choicesAnswer?: AgentChatWebhookChoicesAnswer | null;
};

type AgentWebhookPayloadBase = {
  workspaceId: string;
  agentId: string;
  agentName: string;
  threadId: string;
  /** Absolute URL for the agent to POST a reply message (Bearer = agent API key). */
  replyUrl: string;
  message: AgentChatWebhookMessage;
  /** Last ~10 messages including the new one (oldest → newest). */
  context: AgentChatWebhookMessage[];
  deliveryId: string;
  timestamp: string;
};

export type AgentChatWebhookPayload = AgentWebhookPayloadBase & {
  event: typeof AGENT_CHAT_WEBHOOK_EVENT;
};

export type AgentWebhookTestPayload = AgentWebhookPayloadBase & {
  event: typeof AGENT_WEBHOOK_TEST_EVENT;
  /** Unique id for this test ping — correlate logs; do not treat as a chat message id. */
  testId: string;
};

export type AgentOutboundWebhookPayload =
  | AgentChatWebhookPayload
  | AgentWebhookTestPayload;

export function buildAgentChatReplyUrl(threadId: string): string {
  const base = resolveAgentsPublicBase();
  return `${base}/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`;
}

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
