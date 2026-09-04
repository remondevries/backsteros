import { createHash, randomBytes } from "node:crypto";

import { nanoid } from "nanoid";

import type { ApiKeyScope } from "@backsteros/contracts";

export const API_KEY_PREFIX = "sk_live_";

export function generateApiKeySecret(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function apiKeyLookupPrefix(secret: string): string {
  return secret.slice(0, 16);
}

export function newId(): string {
  return nanoid();
}

/** Stable id so local + cloud meeting apply insert the same CRM activity rows. */
export function meetingCrmActivityId(
  meetingId: string,
  subjectType: string,
  subjectId: string,
): string {
  return createHash("sha256")
    .update(`crm-meeting-activity:${meetingId}:${subjectType}:${subjectId}`)
    .digest("hex")
    .slice(0, 21);
}

export function hasScope(scopes: ApiKeyScope[], required: ApiKeyScope): boolean {
  return scopes.includes(required);
}

export function hasAnyScope(
  scopes: ApiKeyScope[],
  required: ApiKeyScope[],
): boolean {
  return required.some((scope) => scopes.includes(scope));
}
