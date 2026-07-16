import type { Context, Next } from "hono";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { and, eq, isNull } from "drizzle-orm";

import type { ApiKeyScope } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  hashApiKey,
  hasAnyScope,
  hasScope,
  newId,
} from "../lib/crypto.js";

export type AuthKind = "api_key" | "clerk";

export type AuthContext = {
  kind: AuthKind;
  userId: string | null;
  clerkUserId: string | null;
  apiKeyId: string | null;
  scopes: ApiKeyScope[];
};

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
    scopes: row.scopes as ApiKeyScope[],
  };
}

export async function authenticateClerk(
  token: string,
): Promise<AuthContext | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required for Clerk authentication");
  }

  const verified = await verifyToken(token, { secretKey });
  const clerkUserId = verified.sub;

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  let userId = existing?.id ?? null;

  if (!userId) {
    userId = newId();
    await db.insert(users).values({
      id: userId,
      clerkId: clerkUserId,
      email: typeof verified.email === "string" ? verified.email : null,
      role: "owner",
    });
  }

  return {
    kind: "clerk",
    userId,
    clerkUserId,
    apiKeyId: null,
    scopes: [],
  };
}

export async function resolveAuth(authorization: string | undefined): Promise<AuthContext | null> {
  const token = getBearerToken(authorization);
  if (!token) {
    return null;
  }

  if (token.startsWith("sk_live_")) {
    return authenticateApiKey(token);
  }

  try {
    return await authenticateClerk(token);
  } catch {
    return null;
  }
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

export function requireClerkSession() {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth");

    if (!auth || auth.kind !== "clerk") {
      return c.json(unauthorized("Clerk session required"), 401);
    }

    await next();
  };
}

export function requireScope(scope: ApiKeyScope) {
  return (auth: AuthContext | undefined): boolean => {
    if (!auth || auth.kind !== "api_key") {
      return false;
    }
    return hasScope(auth.scopes, scope);
  };
}

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});
