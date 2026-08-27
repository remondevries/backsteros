import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "../db/index.js";
import { areas, syncEvents } from "../db/schema.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { applyPowerSyncBatch } from "../services/sync.js";

const ws = process.env.PROOF_WORKSPACE_ID?.trim() || "ws_legacy_default";

async function cloudLastSyncId(): Promise<number> {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  const response = await fetch(
    `${config.peerUrl}/internal/core-replication/sync-events?workspace_id=${ws}&after=0&limit=1`,
    { headers: { Authorization: `Bearer ${config.secret}` } },
  );
  if (!response.ok) {
    throw new Error(`cloud sync-events failed (${response.status})`);
  }
  const payload = (await response.json()) as { last_sync_id: number };
  return payload.last_sync_id;
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
  const cloudBefore = await cloudLastSyncId();
  const localBefore = await localSyncEventsMax();
  const marker = `areas-leader-proof-${Date.now()}`;
  const areaId = crypto.randomUUID().replace(/-/g, "");
  const mutationId = `proof:powersync:areas:${Date.now()}:${crypto.randomUUID()}`;

  console.log("area_id", areaId);
  console.log("mutation_id", mutationId);
  console.log("cloud_last_sync_id_before", cloudBefore);
  console.log("local_sync_events_max_before", localBefore);

  const result = await applyPowerSyncBatch({
    workspaceId: ws,
    deviceId: "proof-areas-device",
    mutationId,
    batch: [
      {
        table: "areas",
        op: "PUT",
        id: areaId,
        data: {
          name: marker,
          parent: "personal",
          sort_order: Date.now(),
        },
      },
    ],
  });

  const cloudAfter = await cloudLastSyncId();
  const localAfter = await localSyncEventsMax();

  const [row] = await db
    .select({ name: areas.name, parent: areas.parent })
    .from(areas)
    .where(and(eq(areas.workspaceId, ws), eq(areas.id, areaId)))
    .limit(1);

  const newEvents = await db
    .select({ cursor: syncEvents.cursor, entity: syncEvents.entity })
    .from(syncEvents)
    .where(and(eq(syncEvents.workspaceId, ws), gt(syncEvents.cursor, localBefore)))
    .orderBy(desc(syncEvents.cursor));

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

  if (cloudAfter <= cloudBefore) {
    throw new Error("cloud last_sync_id did not advance");
  }
  if (localAfter !== localBefore) {
    throw new Error("local sync_events cursor advanced (fork append)");
  }
  if (row?.name !== marker) {
    throw new Error("local area row does not match applied batch");
  }

  console.log("PROOF_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
