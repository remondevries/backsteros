import { and, asc, desc, eq, gt } from "drizzle-orm";

import { db } from "../db/index.js";
import { mutationReceipts, syncEvents } from "../db/schema.js";
import type { SyncEntity, SyncOperation } from "../lib/sync-constants.js";

/** Drizzle db or transaction — enough for sync_events / receipt writes. */
type DbExecutor = {
  insert: typeof db.insert;
  select: typeof db.select;
};

/**
 * Append one ordered sync_events row. `cursor` (serial PK) is the workspace
 * monotonic sync id (Linear-style lastSyncId on this core).
 */
export async function appendSyncEvent(
  input: {
    workspaceId: string;
    mutationId: string;
    deviceId?: string;
    entity: SyncEntity;
    entityId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
  },
  executor: DbExecutor = db,
): Promise<void> {
  await executor.insert(syncEvents).values({
    workspaceId: input.workspaceId,
    mutationId: input.mutationId,
    deviceId: input.deviceId ?? null,
    entity: input.entity,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
  });
}

/** Highest sync_events.cursor for the workspace (= lastSyncId on this core). */
export async function getWorkspaceLastSyncId(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(eq(syncEvents.workspaceId, workspaceId))
    .orderBy(desc(syncEvents.cursor))
    .limit(1);
  return row?.cursor ?? 0;
}

/**
 * REST / agent writes that bypass PowerSync upload must still advance the
 * same ordered log. On local-core (replica), forward to cloud leader first so
 * cloud assigns sync_id; then apply the returned ordered event locally.
 * On cloud / offline: claim a mutation receipt and append locally.
 */
export async function recordRestEntitySyncEvent(input: {
  workspaceId: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  mutationId?: string;
  deviceId?: string;
}): Promise<"recorded" | "duplicate"> {
  const mutationId =
    input.mutationId ??
    `rest:${input.entity}:${input.entityId}:${input.operation}:${Date.now()}:${crypto.randomUUID()}`;

  const { shouldForwardMutationsToLeader, commitMutationsLeaderFirst } =
    await import("./core-replication/leader-mutations.js");

  if (shouldForwardMutationsToLeader()) {
    const result = await commitMutationsLeaderFirst({
      workspaceId: input.workspaceId,
      mutationId,
      deviceId: input.deviceId ?? "rest",
      changes: [
        {
          entity: input.entity,
          entityId: input.entityId,
          operation: input.operation,
          payload: input.payload,
          eventMutationId: mutationId,
        },
      ],
    });
    return result.events.length > 0 ? "recorded" : "duplicate";
  }

  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(mutationReceipts)
      .values({
        workspaceId: input.workspaceId,
        mutationId,
        deviceId: input.deviceId ?? "rest",
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });

    if (!receipt) {
      return "duplicate";
    }

    await appendSyncEvent(
      {
        workspaceId: input.workspaceId,
        mutationId,
        deviceId: input.deviceId ?? "rest",
        entity: input.entity,
        entityId: input.entityId,
        operation: input.operation,
        payload: input.payload,
      },
      tx,
    );

    await tx
      .update(mutationReceipts)
      .set({ result: { accepted: true, source: "rest" } })
      .where(
        and(
          eq(mutationReceipts.workspaceId, input.workspaceId),
          eq(mutationReceipts.mutationId, mutationId),
        ),
      );

    return "recorded";
  });
}

export type SyncEventRow = {
  cursor: number;
  mutationId: string;
  deviceId: string | null;
  entity: string;
  entityId: string;
  operation: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

/** Ordered page of sync_events after a cursor (peer delta feed). */
export async function listSyncEventsAfter(input: {
  workspaceId: string;
  afterCursor: number;
  limit?: number;
}): Promise<SyncEventRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, input.workspaceId),
        gt(syncEvents.cursor, input.afterCursor),
      ),
    )
    .orderBy(asc(syncEvents.cursor))
    .limit(limit);

  return rows.map((row) => ({
    cursor: row.cursor,
    mutationId: row.mutationId,
    deviceId: row.deviceId,
    entity: row.entity,
    entityId: row.entityId,
    operation: row.operation,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  }));
}
