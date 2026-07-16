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

export function hasScope(scopes: ApiKeyScope[], required: ApiKeyScope): boolean {
  return scopes.includes(required);
}

export function hasAnyScope(
  scopes: ApiKeyScope[],
  required: ApiKeyScope[],
): boolean {
  return required.some((scope) => scopes.includes(scope));
}
