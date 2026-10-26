import { createHash, randomBytes } from "node:crypto";

import { nanoid } from "nanoid";

import {
  API_KEY_LOOKUP_RANDOM_CHARS,
  API_KEY_SECRET_PREFIX_LEGACY,
  apiKeySecretPrefixForKind,
  isApiKeySecretFormat,
  matchApiKeySecretPrefix,
  type ApiKeyCreateKind,
  type ApiKeyScope,
} from "@backsteros/contracts";

/** @deprecated Prefer typed prefixes / {@link isApiKeySecretFormat}. Legacy only. */
export const API_KEY_PREFIX = API_KEY_SECRET_PREFIX_LEGACY;
export const SPACE_SITE_KEY_PREFIX = "sk_space_";

export { isApiKeySecretFormat, matchApiKeySecretPrefix };

/**
 * Mint a secret for a create-kind. Pass `"legacy"` only for non-typed mints
 * (e.g. Dynamic Island) that still use `sk_live_`.
 */
export function generateApiKeySecret(
  kind: ApiKeyCreateKind | "legacy" = "legacy",
): string {
  const prefix =
    kind === "legacy"
      ? API_KEY_SECRET_PREFIX_LEGACY
      : apiKeySecretPrefixForKind(kind);
  return `${prefix}${randomBytes(24).toString("base64url")}`;
}

export function generateSpaceSiteKeySecret(): string {
  return `${SPACE_SITE_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * DB lookup key: recognized secret prefix + {@link API_KEY_LOOKUP_RANDOM_CHARS}
 * of entropy so long prefixes (e.g. `sk_applications_`) do not collide.
 */
export function apiKeyLookupPrefix(secret: string): string {
  const matched = matchApiKeySecretPrefix(secret);
  if (!matched) {
    return secret.slice(0, 16);
  }
  return secret.slice(0, matched.length + API_KEY_LOOKUP_RANDOM_CHARS);
}

export function newId(): string {
  return nanoid();
}

export function documentPropertyTypeSeedId(
  workspaceId: string,
  key: string,
): string {
  return createHash("sha256")
    .update(`document-property-type:${workspaceId}:${key}`)
    .digest("hex")
    .slice(0, 21);
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
