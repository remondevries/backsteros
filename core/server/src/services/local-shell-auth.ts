import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { users, workspaces } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { resolveOrCreateWorkspace } from "./workspaces.js";
import { LOCAL_SHELL_CLERK_ID } from "./local-shell-auth-config.js";

export {
  DEFAULT_LOCAL_SHELL_TOKEN,
  LOCAL_SHELL_CLERK_ID,
  getLocalShellToken,
  isLocalShellAuthEnabled,
  isLocalShellBearerToken,
} from "./local-shell-auth-config.js";

/**
 * Local-core desktop/mobile shells authenticate with a shared bearer instead of
 * Clerk. Network perimeter (loopback / Tailscale) is the real access control;
 * this resolves the single workspace owner so REST + PowerSync work without a
 * sign-in screen.
 */
export async function resolveLocalShellOwner(): Promise<{
  userId: string;
  clerkUserId: string;
  workspaceId: string;
  membershipRole: string;
}> {
  const [existing] = await db
    .select({
      workspaceId: workspaces.id,
      ownerUserId: workspaces.ownerUserId,
    })
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt))
    .limit(1);

  if (existing?.ownerUserId) {
    const [owner] = await db
      .select({
        id: users.id,
        clerkId: users.clerkId,
      })
      .from(users)
      .where(eq(users.id, existing.ownerUserId))
      .limit(1);

    return {
      userId: existing.ownerUserId,
      clerkUserId: owner?.clerkId ?? LOCAL_SHELL_CLERK_ID,
      workspaceId: existing.workspaceId,
      membershipRole: "owner",
    };
  }

  const [bySynthetic] = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(eq(users.clerkId, LOCAL_SHELL_CLERK_ID))
    .limit(1);

  const userId = bySynthetic?.id ?? newId();
  if (!bySynthetic) {
    await db.insert(users).values({
      id: userId,
      clerkId: LOCAL_SHELL_CLERK_ID,
      email: null,
      displayName: "Local owner",
      role: "owner",
    });
  }

  const membership = await resolveOrCreateWorkspace(userId);
  return {
    userId,
    clerkUserId: LOCAL_SHELL_CLERK_ID,
    workspaceId: membership.workspaceId,
    membershipRole: membership.role,
  };
}
