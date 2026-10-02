import { and, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  coreSyncEventReplicationState,
  mutationReceipts,
  projects,
  tasks,
} from "../../db/schema.js";
import {
  SYNC_ENTITIES,
  SYNC_OPERATIONS,
  type SyncEntity,
  type SyncOperation,
} from "../../lib/sync-constants.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { applySyncChange, type SyncChange } from "../sync.js";
import {
  getWorkspaceLastSyncId,
  listSyncEventsAfter,
  type SyncEventRow,
} from "../sync-log.js";
import {
  getCoreReplicationConfig,
  isSyncEventPullEnabled,
} from "./config.js";
import {
  resolvePeerEventUpdatedAt,
  shouldSkipPeerEventAsStale,
} from "./peer-sync-event-apply.js";

const PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 120_000;

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

function replicationWorkspaceIds(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.CORE_REPLICATION_WORKSPACE_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function getSyncEventPullCursor(
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select()
    .from(coreSyncEventReplicationState)
    .where(eq(coreSyncEventReplicationState.workspaceId, workspaceId))
    .limit(1);
  return row?.afterCursor ?? 0;
}

export async function setSyncEventPullCursor(
  workspaceId: string,
  afterCursor: number,
): Promise<void> {
  const existing = await getSyncEventPullCursor(workspaceId);
  if (afterCursor < existing) return;

  await db
    .insert(coreSyncEventReplicationState)
    .values({
      workspaceId,
      afterCursor,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coreSyncEventReplicationState.workspaceId,
      set: {
        afterCursor,
        updatedAt: new Date(),
      },
    });
}

export type SyncEventsFeedResponse = {
  workspace_id: string;
  after: number;
  last_sync_id: number;
  events: Array<{
    cursor: number;
    mutation_id: string;
    device_id: string | null;
    entity: string;
    entity_id: string;
    operation: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  has_more: boolean;
};

/** Serve ordered sync_events after a cursor (leader / peer delta feed). */
export async function buildSyncEventsFeed(input: {
  workspaceId: string;
  afterCursor: number;
  limit?: number;
}): Promise<SyncEventsFeedResponse> {
  const limit = Math.min(Math.max(input.limit ?? PAGE_SIZE, 1), 500);
  const rows = await listSyncEventsAfter({
    workspaceId: input.workspaceId,
    afterCursor: input.afterCursor,
    limit,
  });
  const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
  return {
    workspace_id: input.workspaceId,
    after: input.afterCursor,
    last_sync_id: lastSyncId,
    events: rows.map((row) => ({
      cursor: row.cursor,
      mutation_id: row.mutationId,
      device_id: row.deviceId,
      entity: row.entity,
      entity_id: row.entityId,
      operation: row.operation,
      payload: row.payload,
      created_at: row.createdAt.toISOString(),
    })),
    has_more: rows.length >= limit,
  };
}

function parseSyncEntity(value: string): SyncEntity | null {
  return (SYNC_ENTITIES as readonly string[]).includes(value)
    ? (value as SyncEntity)
    : null;
}

function parseSyncOperation(value: string): SyncOperation | null {
  return (SYNC_OPERATIONS as readonly string[]).includes(value)
    ? (value as SyncOperation)
    : null;
}

async function readLocalEntityUpdatedAt(
  workspaceId: string,
  entity: SyncEntity,
  entityId: string,
  executor: DbExecutor,
): Promise<Date | null> {
  if (entity === "project") {
    const [row] = await executor
      .select({ updatedAt: projects.updatedAt })
      .from(projects)
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, entityId)),
      )
      .limit(1);
    return row?.updatedAt ?? null;
  }
  if (entity === "task") {
    const [row] = await executor
      .select({ updatedAt: tasks.updatedAt })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, entityId)))
      .limit(1);
    return row?.updatedAt ?? null;
  }
  return null;
}

/**
 * After peer apply, force the row time back to the event's updated_at for
 * entities that still stamp `now` inside their service writers (OS-49).
 * Projects/tasks already preserve via WriteOptions; this is belt-and-suspenders.
 */
async function stampPeerEntityUpdatedAt(
  workspaceId: string,
  entity: SyncEntity,
  entityId: string,
  updatedAt: Date,
  executor: DbExecutor,
): Promise<void> {
  if (entity === "project") {
    await executor
      .update(projects)
      .set({ updatedAt })
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, entityId)),
      );
    return;
  }
  if (entity === "task") {
    await executor
      .update(tasks)
      .set({ updatedAt })
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, entityId)));
  }
}

/**
 * Apply one peer sync_event locally without appending to this core's
 * sync_events (avoids forking the serial clock). Same mutation_id claims a
 * receipt so PowerSync/REST retries with that id do not double-apply.
 *
 * OS-49 / OS-42: keeps the event's own updated_at, skips events older than the
 * local row, skips vault side effects on projects, skips task activity /
 * auto-timer side effects, and does not freshen timestamps so table LWW will
 * not push stale values back to the peer.
 */
export async function applyPeerSyncEvent(
  workspaceId: string,
  event: SyncEventRow,
): Promise<"applied" | "duplicate" | "skipped"> {
  const entity = parseSyncEntity(event.entity);
  const operation = parseSyncOperation(event.operation);
  if (!entity || !operation) {
    return "skipped";
  }

  const eventUpdatedAt = resolvePeerEventUpdatedAt({
    payload: event.payload ?? {},
    createdAt: event.createdAt,
  });

  const change: SyncChange = {
    entity,
    entity_id: event.entityId,
    operation,
    payload: event.payload,
    updated_at: eventUpdatedAt.getTime(),
  };

  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(mutationReceipts)
      .values({
        workspaceId,
        mutationId: event.mutationId,
        deviceId: event.deviceId ?? "peer",
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });

    if (!receipt) {
      return "duplicate";
    }

    const localUpdatedAt = await readLocalEntityUpdatedAt(
      workspaceId,
      entity,
      event.entityId,
      tx,
    );
    if (shouldSkipPeerEventAsStale(eventUpdatedAt, localUpdatedAt)) {
      await tx
        .update(mutationReceipts)
        .set({
          result: {
            accepted: true,
            skipped: "stale_peer_event",
            source: "peer_sync_event",
            peer_cursor: event.cursor,
            event_updated_at: eventUpdatedAt.toISOString(),
            local_updated_at: localUpdatedAt?.toISOString() ?? null,
          },
        })
        .where(
          and(
            eq(mutationReceipts.workspaceId, workspaceId),
            eq(mutationReceipts.mutationId, event.mutationId),
          ),
        );
      return "skipped";
    }

    await applySyncChange(workspaceId, change, tx, {
      peerReplay: { updatedAt: eventUpdatedAt },
    });

    // Belt-and-suspenders for writers that still stamp now (e.g. tasks).
    if (operation !== "delete") {
      await stampPeerEntityUpdatedAt(
        workspaceId,
        entity,
        event.entityId,
        eventUpdatedAt,
        tx,
      );
    }

    await tx
      .update(mutationReceipts)
      .set({
        result: {
          accepted: true,
          source: "peer_sync_event",
          peer_cursor: event.cursor,
          event_updated_at: eventUpdatedAt.toISOString(),
        },
      })
      .where(
        and(
          eq(mutationReceipts.workspaceId, workspaceId),
          eq(mutationReceipts.mutationId, event.mutationId),
        ),
      );

    return "applied";
  });
}

async function pullWorkspaceSyncEvents(workspaceId: string): Promise<{
  applied: number;
  duplicate: number;
  skipped: number;
  peerMissing?: boolean;
  stuck?: { cursor: number; entity: string; entityId: string; error: string };
}> {
  const config = getCoreReplicationConfig();
  if (!config) {
    return { applied: 0, duplicate: 0, skipped: 0 };
  }

  let after = await getSyncEventPullCursor(workspaceId);
  let applied = 0;
  let duplicate = 0;
  let skipped = 0;

  for (;;) {
    const url = new URL(
      `${config.peerUrl}/internal/core-replication/sync-events`,
    );
    url.searchParams.set("workspace_id", workspaceId);
    url.searchParams.set("after", String(after));
    url.searchParams.set("limit", String(PAGE_SIZE));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let payload: SyncEventsFeedResponse;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: replicationHeaders(config.secret),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        // Peer not yet deployed with this route — skip ordered pull; table LWW continues.
        if (response.status === 404) {
          return { applied: 0, duplicate: 0, skipped: 0, peerMissing: true };
        }
        throw new Error(
          `pull sync-events failed (${response.status}): ${body}`,
        );
      }
      payload = (await response.json()) as SyncEventsFeedResponse;
    } finally {
      clearTimeout(timeout);
    }

    if (!payload.events?.length) {
      break;
    }

    for (const raw of payload.events) {
      const event: SyncEventRow = {
        cursor: raw.cursor,
        mutationId: raw.mutation_id,
        deviceId: raw.device_id,
        entity: raw.entity,
        entityId: raw.entity_id,
        operation: raw.operation,
        payload: raw.payload ?? {},
        createdAt: new Date(raw.created_at),
      };
      let result: "applied" | "duplicate" | "skipped";
      try {
        result = await applyPeerSyncEvent(workspaceId, event);
      } catch (error) {
        // OS-49: do not advance past a failed event — leave it visible and retry.
        const message = error instanceof Error ? error.message : String(error);
        appendOpsLog(
          "error",
          "core sync-events pull stuck",
          `workspace=${workspaceId} cursor=${event.cursor} ${event.operation} ${event.entity}/${event.entityId}: ${message}`,
        );
        return {
          applied,
          duplicate,
          skipped,
          stuck: {
            cursor: event.cursor,
            entity: event.entity,
            entityId: event.entityId,
            error: message,
          },
        };
      }
      if (result === "applied") {
        applied += 1;
        // Open desktop shells subscribe on local — rebroadcast before PowerSync.
        const { publishWorkspaceUpdatedFromSyncEvent } = await import(
          "./sync-event-live-publish.js"
        );
        publishWorkspaceUpdatedFromSyncEvent(workspaceId, event);
      } else if (result === "duplicate") duplicate += 1;
      else skipped += 1;
      after = Math.max(after, event.cursor);
      await setSyncEventPullCursor(workspaceId, after);
    }

    if (!payload.has_more) {
      break;
    }
  }

  return { applied, duplicate, skipped };
}

/**
 * Replica (local-core) pulls ordered sync_events from the peer leader clock.
 * Cloud does not pull this feed — one leader, no second peer LWW authority.
 */
export async function pullPeerSyncEvents(): Promise<void> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    return;
  }

  if (!isSyncEventPullEnabled()) {
    appendOpsLog(
      "info",
      "core sync-events pull skipped",
      "CORE_REPLICATION_SYNC_EVENTS_PULL=0 (emergency off-switch; table LWW continues)",
    );
    return;
  }

  const workspaceIds = replicationWorkspaceIds();
  if (workspaceIds.length === 0) {
    return;
  }

  for (const workspaceId of workspaceIds) {
    const result = await pullWorkspaceSyncEvents(workspaceId);
    if (result.peerMissing) {
      appendOpsLog(
        "info",
        `core sync-events pull ${workspaceId}`,
        "peer feed not deployed yet (404); table LWW continues",
      );
      continue;
    }
    if (result.stuck) {
      appendOpsLog(
        "error",
        `core sync-events pull ${workspaceId} stuck`,
        `cursor=${result.stuck.cursor} ${result.stuck.entity}/${result.stuck.entityId}: ${result.stuck.error} (cursor not advanced; will retry)`,
      );
      continue;
    }
    if (result.applied + result.duplicate + result.skipped > 0) {
      appendOpsLog(
        "info",
        `core sync-events pull ${workspaceId}`,
        `${result.applied} applied, ${result.duplicate} duplicate, ${result.skipped} skipped`,
      );
    }
  }
}
