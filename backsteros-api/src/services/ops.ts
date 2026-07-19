import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { syncEvents, workspaces } from "../db/schema.js";
import { listOpsLogs, type OpsLogEntry } from "../lib/ops-log-buffer.js";

export type OpsSyncDevice = {
  deviceId: string;
  lastSeenAt: string;
  eventCount: number;
};

export type OpsSyncHealth = {
  workspaceId: string;
  cursor: number;
  eventsLastHour: number;
  devices: OpsSyncDevice[];
  /** Reserved — push failures are not persisted yet; surfaced via log tail. */
  failedPushes: Array<{ id: string; at: string; message: string }>;
  spacesConfigured: boolean;
};

export async function getOpsSyncHealth(
  workspaceId: string,
  spacesConfigured: boolean,
): Promise<OpsSyncHealth> {
  const [cursorRow] = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(eq(syncEvents.workspaceId, workspaceId))
    .orderBy(desc(syncEvents.cursor))
    .limit(1);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [hourCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, workspaceId),
        gte(syncEvents.createdAt, hourAgo),
      ),
    );

  const deviceRows = await db
    .select({
      deviceId: syncEvents.deviceId,
      lastSeenAt: sql<string>`max(${syncEvents.createdAt})`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, workspaceId),
        isNotNull(syncEvents.deviceId),
      ),
    )
    .groupBy(syncEvents.deviceId)
    .orderBy(desc(sql`max(${syncEvents.createdAt})`))
    .limit(50);

  return {
    workspaceId,
    cursor: cursorRow?.cursor ?? 0,
    eventsLastHour: hourCount?.count ?? 0,
    devices: deviceRows
      .filter((row): row is typeof row & { deviceId: string } =>
        Boolean(row.deviceId),
      )
      .map((row) => ({
        deviceId: row.deviceId,
        lastSeenAt:
          typeof row.lastSeenAt === "string"
            ? row.lastSeenAt
            : new Date(row.lastSeenAt).toISOString(),
        eventCount: row.eventCount,
      })),
    failedPushes: [],
    spacesConfigured,
  };
}

export async function assertWorkspaceOwner(
  workspaceId: string,
  userId: string,
  membershipRole: string | null,
): Promise<boolean> {
  if (membershipRole === "owner") {
    return true;
  }

  const allowlist = (process.env.ADMIN_OWNER_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowlist.includes(userId)) {
    return true;
  }

  const [workspace] = await db
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace?.ownerUserId === userId;
}

export function getOpsLogTail(limit: number): OpsLogEntry[] {
  return listOpsLogs(limit);
}
