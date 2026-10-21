import { timingSafeEqual } from "node:crypto";

import type { ApiKeyScope } from "@backsteros/contracts";

import { API_KEY_PREFIX, hasScope } from "../../lib/crypto.js";
import type { AuthContext } from "../../middleware/auth.js";

/** Decode HTTP Basic credentials (CardDAV / iOS Contacts). */
export function parseBasicAuthCredentials(
  authorization: string | undefined,
): { username: string; password: string } | null {
  if (!authorization?.startsWith("Basic ")) {
    return null;
  }
  const encoded = authorization.slice("Basic ".length).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return {
      username: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    };
  } catch {
    return null;
  }
}

export function isApiKeySecret(secret: string): boolean {
  return secret.startsWith(API_KEY_PREFIX);
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Optional shared CardDAV Basic password (`CARDDAV_PASSWORD`) for easy device setup.
 * Workspace: `CARDDAV_WORKSPACE_ID` or `ws_legacy_default`.
 */
export function authenticateCardDavSharedPassword(
  password: string,
): AuthContext | null {
  const expected = process.env.CARDDAV_PASSWORD?.trim() ?? "";
  if (!expected || !secretsEqual(password, expected)) {
    return null;
  }
  const workspaceId =
    process.env.CARDDAV_WORKSPACE_ID?.trim() || "ws_legacy_default";
  return {
    kind: "api_key",
    userId: null,
    clerkUserId: null,
    apiKeyId: null,
    apiKeyName: "carddav-shared",
    contactId: null,
    workspaceId,
    membershipRole: null,
    scopes: ["carddav"],
  };
}

/** True when the key may use the CardDAV address-book surface. */
export function hasCardDavScope(auth: AuthContext | undefined | null): boolean {
  if (!auth) return false;
  if (auth.kind === "local_shell") return Boolean(auth.membershipRole);
  return hasScope(auth.scopes as ApiKeyScope[], "carddav");
}
