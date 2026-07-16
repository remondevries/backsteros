import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  workspaceMembers,
  workspaceSettings,
  workspaces,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";

export type WorkspaceMembership = {
  workspaceId: string;
  role: string;
};

export async function resolveOrCreateWorkspace(
  userId: string,
): Promise<WorkspaceMembership> {
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.createdAt))
      .limit(1);

    if (membership) {
      return membership;
    }

    // A data-only legacy installation has no owner yet. Claim it exactly once.
    const [legacy] = await tx
      .update(workspaces)
      .set({ ownerUserId: userId, updatedAt: new Date() })
      .where(
        and(eq(workspaces.id, "ws_legacy_default"), isNull(workspaces.ownerUserId)),
      )
      .returning({ workspaceId: workspaces.id });

    const workspaceId = legacy?.workspaceId ?? newId();
    if (!legacy) {
      await tx.insert(workspaces).values({
        id: workspaceId,
        name: "My Workspace",
        slug: `workspace-${workspaceId.toLowerCase()}`,
        ownerUserId: userId,
      });
    }

    await tx
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role: "owner" })
      .onConflictDoNothing();
    await tx
      .insert(workspaceSettings)
      .values({ workspaceId })
      .onConflictDoNothing();

    return { workspaceId, role: "owner" };
  });
}
