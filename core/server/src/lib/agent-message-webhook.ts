/**
 * HMAC helpers for agent message webhooks (OS-146).
 * Reuses the same encryption + header conventions as auto-review webhooks.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  AUTO_REVIEW_DELIVERY_ID_HEADER,
  AUTO_REVIEW_SIGNATURE_HEADER,
  AUTO_REVIEW_TIMESTAMP_HEADER,
  encryptWebhookSecret,
  decryptWebhookSecret,
  validateAutoReviewWebhookUrl,
} from "./auto-review-webhook.js";

export const AGENT_MESSAGE_WEBHOOK_EVENTS = [
  "chat.message",
  "email.message",
] as const;

export type AgentMessageWebhookEvent =
  (typeof AGENT_MESSAGE_WEBHOOK_EVENTS)[number];

export const AGENT_MESSAGE_WEBHOOK_TIMEOUT_MS = 10_000;

export {
  AUTO_REVIEW_DELIVERY_ID_HEADER as AGENT_MESSAGE_DELIVERY_ID_HEADER,
  AUTO_REVIEW_SIGNATURE_HEADER as AGENT_MESSAGE_SIGNATURE_HEADER,
  AUTO_REVIEW_TIMESTAMP_HEADER as AGENT_MESSAGE_TIMESTAMP_HEADER,
  encryptWebhookSecret as encryptAgentMessageWebhookSecret,
  decryptWebhookSecret as decryptAgentMessageWebhookSecret,
  validateAutoReviewWebhookUrl as validateAgentMessageWebhookUrl,
};

export function generateAgentMessageWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signAgentMessageBody(input: {
  body: string;
  timestamp: string;
  secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
}

export function verifyAgentMessageSignature(input: {
  body: string;
  timestamp: string;
  secret: string;
  signature: string;
}): boolean {
  const expected = signAgentMessageBody(input);
  const got = input.signature.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(got, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildAgentMessageWebhookHeaders(input: {
  body: string;
  timestamp: string;
  secret: string;
  deliveryId: string;
}): Record<string, string> {
  const signature = signAgentMessageBody(input);
  return {
    "content-type": "application/json",
    [AUTO_REVIEW_TIMESTAMP_HEADER]: input.timestamp,
    [AUTO_REVIEW_SIGNATURE_HEADER]: `sha256=${signature}`,
    [AUTO_REVIEW_DELIVERY_ID_HEADER]: input.deliveryId,
  };
}

export function normalizeAgentMessageWebhookEvents(
  events: readonly string[] | undefined,
): AgentMessageWebhookEvent[] {
  if (!events || events.length === 0) {
    return [...AGENT_MESSAGE_WEBHOOK_EVENTS];
  }
  const allowed = new Set<string>(AGENT_MESSAGE_WEBHOOK_EVENTS);
  const out: AgentMessageWebhookEvent[] = [];
  for (const event of events) {
    const trimmed = event.trim();
    if (!allowed.has(trimmed)) continue;
    if (!out.includes(trimmed as AgentMessageWebhookEvent)) {
      out.push(trimmed as AgentMessageWebhookEvent);
    }
  }
  return out.length > 0 ? out : [...AGENT_MESSAGE_WEBHOOK_EVENTS];
}
