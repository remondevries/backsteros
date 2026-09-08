import type { Context, Next } from "hono";
import { and, eq, isNull } from "drizzle-orm";

import type { ApiKeyScope } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  hashApiKey,
  hasAnyScope,
  hasScope,
} from "../lib/crypto.js";
import {
  isLocalShellAuthEnabled,
  isLocalShellBearerToken,
  resolveLocalShellOwner,
} from "../services/local-shell-auth.js";
import { warmVaultPathCache } from "../services/vault-settings.js";

export type AuthKind = "api_key" | "local_shell" | "powersync";

export type AuthContext = {
  kind: AuthKind;
  userId: string | null;
  /** Legacy users.clerk_id sentinel (e.g. local_shell); not a Clerk session. */
  clerkUserId: string | null;
  apiKeyId: string | null;
  contactId: string | null;
  workspaceId: string;
  membershipRole: string | null;
  scopes: ApiKeyScope[];
};

/** Local-shell bearer — owner UI on local-core. */
export function isOwnerShellAuth(auth: AuthContext | undefined | null): boolean {
  if (!auth?.userId) return false;
  return auth.kind === "local_shell";
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

function unauthorized(message = "Unauthorized") {
  return { error: message, code: "unauthorized" as const };
}

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length).trim();
}

export async function authenticateApiKey(secret: string): Promise<AuthContext | null> {
  const prefix = apiKeyLookupPrefix(secret);
  const keyHash = hashApiKey(secret);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.prefix, prefix),
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    kind: "api_key",
    userId: row.userId,
    clerkUserId: null,
    apiKeyId: row.id,
    contactId: row.contactId,
    workspaceId: row.workspaceId,
    membershipRole: null,
    scopes: row.scopes as ApiKeyScope[],
  };
}

export async function authenticateLocalShell(
  token: string,
): Promise<AuthContext | null> {
  if (!isLocalShellAuthEnabled() || !isLocalShellBearerToken(token)) {
    return null;
  }

  const owner = await resolveLocalShellOwner();
  return {
    kind: "local_shell",
    userId: owner.userId,
    clerkUserId: owner.clerkUserId,
    apiKeyId: null,
    contactId: null,
    workspaceId: owner.workspaceId,
    membershipRole: owner.membershipRole,
    scopes: [],
  };
}

export async function resolveAuth(authorization: string | undefined): Promise<AuthContext | null> {
  const token = getBearerToken(authorization);
  if (!token) {
    return null;
  }

  let auth: AuthContext | null = null;
  if (token.startsWith("sk_live_")) {
    auth = await authenticateApiKey(token);
  } else if (isLocalShellBearerToken(token)) {
    auth = await authenticateLocalShell(token);
  }

  if (auth) {
    try {
      await warmVaultPathCache(auth.workspaceId);
    } catch {
      /* vault optional until configured */
    }
  }
  return auth;
}

export function requireApiKeyScope(...requiredScopes: ApiKeyScope[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth");

    if (!auth || auth.kind !== "api_key") {
      return c.json(unauthorized("API key required"), 401);
    }

    if (!hasAnyScope(auth.scopes, requiredScopes)) {
      return c.json(
        { error: "Insufficient scope", code: "forbidden" as const },
        403,
      );
    }

    await next();
  };
}

export function requireScope(scope: ApiKeyScope) {
  return (auth: AuthContext | undefined): boolean => {
    if (!auth) {
      return false;
    }
    if (auth.kind === "local_shell") {
      return Boolean(auth.membershipRole);
    }
    return hasScope(auth.scopes, scope);
  };
}
