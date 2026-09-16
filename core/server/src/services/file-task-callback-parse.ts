import { timingSafeEqual, randomBytes } from "node:crypto";

import {
  fileTaskCallbackResultSchema,
  type FileTaskCallbackResult,
} from "@backsteros/contracts";

import { hashApiKey } from "../lib/crypto.js";

export const FILE_TASK_CALLBACK_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_FILE_TASK_CALLBACK_PUBLIC_URL =
  "https://agent.backsteros.com";

export function resolveFileTaskCallbackPublicBase(): string {
  const configured =
    process.env.FILE_TASK_CALLBACK_PUBLIC_URL?.trim() ||
    process.env.AGENTS_PUBLIC_URL?.trim();
  return (configured || DEFAULT_FILE_TASK_CALLBACK_PUBLIC_URL).replace(
    /\/$/,
    "",
  );
}

export function buildFileTaskCallbackUrl(
  requestId: string,
  token: string,
  base = resolveFileTaskCallbackPublicBase(),
): string {
  const url = new URL(
    `/api/v1/public/file-task-callbacks/${encodeURIComponent(requestId)}`,
    `${base}/`,
  );
  url.searchParams.set("token", token);
  return url.toString();
}

export function generateFileTaskCallbackToken(): string {
  return `ftc_${randomBytes(24).toString("base64url")}`;
}

export function hashFileTaskCallbackToken(token: string): string {
  return hashApiKey(token);
}

export function tokenHashesEqual(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseFileTaskCallbackResult(
  body: unknown,
): FileTaskCallbackResult | null {
  const parsed = fileTaskCallbackResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
