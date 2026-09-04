import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "../db/index.js";
import { crmGroups, syncEvents } from "../db/schema.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import type { SyncEventsFeedResponse } from "../services/core-replication/sync-event-replication.js";
import { applyPowerSyncBatch } from "../services/sync.js";

const ws = process.env.PROOF_WORKSPACE_ID?.trim() || "ws_legacy_default";
const PEER_TIMEOUT_MS = 15_000;

async function peerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PEER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.secret}`,
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function cloudLastSyncId(): Promise<number> {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  const response = await peerFetch(
    `${config.peerUrl}/internal/core-replication/sync-events?workspace_id=${ws}&after=0&limit=1`,
  );
  if (!response.ok) {
    throw new Error(`cloud sync-events failed (${response.status})`);
  }
  const payload = (await response.json()) as { last_sync_id: number };
  return payload.last_sync_id;
}

async function cloudSyncEventsAfter(after: number): Promise<SyncEventsFeedResponse> {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  const response = await peerFetch(
    `${config.peerUrl}/internal/core-replication/sync-events?workspace_id=${encodeURIComponent(ws)}&after=${after}&limit=100`,
  );
  if (!response.ok) {
    throw new Error(`cloud sync-events feed failed (${response.status})`);
  }
  return (await response.json()) as SyncEventsFeedResponse;
}

async function localSyncEventsMax(): Promise<number> {
  const [row] = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(eq(syncEvents.workspaceId, ws))
    .orderBy(desc(syncEvents.cursor))
    .limit(1);
  return row?.cursor ?? 0;
}

async function main() {
  const config = getCoreReplicationConfig();
  console.log("workspace_id", ws);
  console.log("replication_role", config?.role ?? "none");
  console.log("peer_url", config?.peerUrl ?? "none");

  const cloudBefore = await cloudLastSyncId();
  const localBefore = await localSyncEventsMax();
  const marker = `crm-ps-leader-proof-${Date.now()}`;
  const groupId = crypto.randomUUID();
  const mutationId = `proof:crm-powersync:${Date.now()}:${crypto.randomUUID()}`;

  console.log("group_id", groupId);
  console.log("mutation_id", mutationId);
  console.log("cloud_last_sync_id_before", cloudBefore);
  console.log("local_sync_events_max_before", localBefore);

  const result = await applyPowerSyncBatch({
    workspaceId: ws,
    deviceId: "proof-crm-powersync-device",
    mutationId,
    batch: [
      {
        table: "crm_groups",
        op: "PUT",
        id: groupId,
        data: {
          name: marker,
          description: null,
          color: "#336699",
          icon: null,
          sort_order: Date.now(),
        },
      },
    ],
  });

  const cloudAfter = await cloudLastSyncId();
  const localAfter = await localSyncEventsMax();

  const [row] = await db
    .select({ id: crmGroups.id, name: crmGroups.name })
    .from(crmGroups)
    .where(and(eq(crmGroups.workspaceId, ws), eq(crmGroups.id, groupId)))
    .limit(1);

  const newEvents = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(and(eq(syncEvents.workspaceId, ws), gt(syncEvents.cursor, localBefore)))
    .orderBy(desc(syncEvents.cursor));

  const cloudFeed = await cloudSyncEventsAfter(cloudBefore);
  const cloudCrmEvent = cloudFeed.events.find(
    (event) => event.entity === "crm_group" && event.entity_id === groupId,
  );

  console.log("batch_result", result);
  console.log("local_row", row);
  console.log("cloud_last_sync_id_after", cloudAfter);
  console.log("local_sync_events_max_after", localAfter);
  console.log(
    "local_sync_events_appended",
    newEvents.length > 0 ? newEvents.map((event) => event.cursor) : "none",
  );
  console.log("cloud_advanced", cloudAfter > cloudBefore);
  console.log("local_cursor_unchanged", localAfter === localBefore);
  console.log("row_matches_batch", row?.name === marker);
  console.log("cloud_crm_group_event", cloudCrmEvent ?? "none");

  if (cloudAfter <= cloudBefore) {
    throw new Error("cloud last_sync_id did not advance");
  }
  if (localAfter !== localBefore) {
    throw new Error("local sync_events cursor advanced (fork append)");
  }
  if (row?.name !== marker) {
    throw new Error("local crm_groups row does not match applied batch");
  }
  if (!cloudCrmEvent) {
    throw new Error("cloud sync_events feed missing crm_group upsert");
  }

  // Cleanup — soft-delete proof row locally (leader-first delete reaches cloud).
  const deleteMutationId = `proof:crm-powersync-delete:${Date.now()}:${crypto.randomUUID()}`;
  await applyPowerSyncBatch({
    workspaceId: ws,
    deviceId: "proof-crm-powersync-device",
    mutationId: deleteMutationId,
    batch: [
      {
        table: "crm_groups",
        op: "PATCH",
        id: groupId,
        data: { deleted_at: new Date().toISOString() },
      },
    ],
  });

  const [deletedRow] = await db
    .select({ deletedAt: crmGroups.deletedAt })
    .from(crmGroups)
    .where(and(eq(crmGroups.workspaceId, ws), eq(crmGroups.id, groupId)))
    .limit(1);

  console.log("cleanup_soft_deleted", Boolean(deletedRow?.deletedAt));
  console.log("PROOF_OK");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
