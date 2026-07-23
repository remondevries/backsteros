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
import { resolveOrCreateWorkspace } from "../services/workspaces.js";

export type AuthKind = "api_key" | "clerk";

export type AuthContext = {
  kind: AuthKind;
  userId: string | null;
  clerkUserId: string | null;
  apiKeyId: string | null;
  workspaceId: string;
  membershipRole: string | null;
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

function clerkDisplayName(input: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): string | null {
  const full = input.fullName?.trim();
  if (full) return full;
  const parts = [input.firstName, input.lastName]
    .map((part) => part?.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  const username = input.username?.trim();
  return username || null;
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
    workspaceId: row.workspaceId,
    membershipRole: null,
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
  const verifiedRecord = verified as Record<string, unknown>;
  let email =
    (typeof verifiedRecord.email === "string" && verifiedRecord.email) ||
    (typeof verifiedRecord.email_address === "string" &&
      verifiedRecord.email_address) ||
    existing?.email ||
    null;
  let displayName = existing?.displayName ?? null;

  try {
    const clerk = createClerkClient({ secretKey });
    const clerkUser = await clerk.users.getUser(clerkUserId);
    email =
      clerkUser.emailAddresses.find(
        (entry) => entry.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      email;
    displayName =
      clerkDisplayName({
        fullName: clerkUser.fullName,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        username: clerkUser.username,
      }) ?? displayName;
  } catch {
    /* keep whatever we already resolved */
  }

  if (!userId) {
    const proposedUserId = newId();
    await db
      .insert(users)
      .values({
        id: proposedUserId,
        clerkId: clerkUserId,
        email,
        displayName,
        role: "owner",
      })
      .onConflictDoNothing();
    const [createdOrRaced] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);
    userId = createdOrRaced?.id ?? null;
    email = createdOrRaced?.email ?? email;
    displayName = createdOrRaced?.displayName ?? displayName;
  } else if (
    (email && email !== existing?.email) ||
    (displayName && displayName !== existing?.displayName)
  ) {
    await db
      .update(users)
      .set({
        email: email ?? existing?.email ?? null,
        displayName: displayName ?? existing?.displayName ?? null,
      })
      .where(eq(users.id, userId));
  }

  if (!userId) {
    throw new Error("Failed to resolve Clerk user");
  }

  const membership = await resolveOrCreateWorkspace(userId);

  return {
    kind: "clerk",
    userId,
    clerkUserId,
    apiKeyId: null,
    workspaceId: membership.workspaceId,
    membershipRole: membership.role,
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
    if (!auth) {
      return false;
    }
    if (auth.kind === "clerk") {
      return Boolean(auth.membershipRole);
    }
    return hasScope(auth.scopes, scope);
  };
}

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});
