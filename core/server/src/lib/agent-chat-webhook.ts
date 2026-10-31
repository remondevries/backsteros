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

export type AgentChatWebhookApprovalField = {
  label: string;
  value: string;
};

export type AgentChatWebhookApproval = {
  title: string;
  kind: "deploy" | "invoice" | "email" | "payment" | "delete" | "generic";
  summary: string;
  fields?: AgentChatWebhookApprovalField[];
  details?: string;
  approveLabel?: string;
  rejectLabel?: string;
  destructive: boolean;
};

export type AgentChatWebhookApprovalAnswer = {
  decision: "approved" | "rejected";
  note?: string;
  answeredAt: string;
};

export type AgentChatWebhookFormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox";
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  min?: number | string;
  max?: number | string;
};

export type AgentChatWebhookForm = {
  title: string;
  description?: string;
  submitLabel?: string;
  fields: AgentChatWebhookFormField[];
};

export type AgentChatWebhookFormAnswer = {
  values: Record<string, string | number | boolean>;
  answeredAt: string;
};

export type AgentChatWebhookAttachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  kind: "image" | "pdf" | "file";
};

export type AgentChatWebhookLinkPreview = {
  url: string;
  siteName?: string | null;
  faviconUrl?: string | null;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

export type AgentChatWebhookProgressStep = {
  label: string;
  state: "pending" | "running" | "done" | "failed";
};

export type AgentChatWebhookProgress = {
  title: string;
  state: "running" | "succeeded" | "failed" | "canceled";
  steps?: AgentChatWebhookProgressStep[];
  current?: number;
  total?: number;
  detail?: string;
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
  /** Assistant-only approve/reject card (when present on context messages). */
  approval?: AgentChatWebhookApproval;
  approvalAnswer?: AgentChatWebhookApprovalAnswer | null;
  /** Assistant-only small form (when present on context messages). */
  form?: AgentChatWebhookForm;
  formAnswer?: AgentChatWebhookFormAnswer | null;
  /** Assistant-only live progress (when present on context messages). */
  progress?: AgentChatWebhookProgress;
  /** Files attached to this message. */
  attachments?: AgentChatWebhookAttachment[];
  /** Server-resolved URL previews for links in `text`. */
  linkPreviews?: AgentChatWebhookLinkPreview[];
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
