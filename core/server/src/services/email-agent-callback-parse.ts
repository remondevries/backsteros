import { timingSafeEqual, randomBytes } from "node:crypto";

import {
  emailAgentCallbackResultSchema,
  type EmailAgentCallbackResult,
} from "@backsteros/contracts";

import { hashApiKey } from "../lib/crypto.js";
import {
  DEFAULT_FILE_TASK_CALLBACK_PUBLIC_URL,
  resolveFileTaskCallbackPublicBase,
} from "./file-task-callback-parse.js";

export const EMAIL_AGENT_CALLBACK_TTL_MS = 30 * 60 * 1000;

export function resolveEmailAgentCallbackPublicBase(): string {
  return resolveFileTaskCallbackPublicBase();
}

export function buildEmailAgentCallbackUrl(
  requestId: string,
  token: string,
  base = resolveEmailAgentCallbackPublicBase(),
): string {
  const url = new URL(
    `/api/v1/public/email-agent-callbacks/${encodeURIComponent(requestId)}`,
    `${base}/`,
  );
  url.searchParams.set("token", token);
  return url.toString();
}

export function generateEmailAgentCallbackToken(): string {
  return `eac_${randomBytes(24).toString("base64url")}`;
}

export function hashEmailAgentCallbackToken(token: string): string {
  return hashApiKey(token);
}

export function emailAgentTokenHashesEqual(
  left: string,
  right: string,
): boolean {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseEmailAgentCallbackResult(
  body: unknown,
): EmailAgentCallbackResult | null {
  const parsed = emailAgentCallbackResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export { DEFAULT_FILE_TASK_CALLBACK_PUBLIC_URL };
