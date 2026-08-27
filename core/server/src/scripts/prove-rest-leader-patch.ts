import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { syncEvents, tasks } from "../db/schema.js";
import { createApiKey } from "../services/api-keys.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";

const ws = process.env.PROOF_WORKSPACE_ID?.trim() || "ws_legacy_default";
const apiBase = process.env.PROOF_API_URL?.trim() || "http://127.0.0.1:8788";

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

async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env.PROOF_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const { secret } = await createApiKey(ws, "SiChwMAnh6tXSbe-dVIIP", {
    name: `rest-leader-proof-${Date.now()}`,
    scopes: ["tasks:read", "tasks:write"],
  });
  return secret;
}

async function main() {
  const apiKey = await resolveApiKey();

  const [task] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, ws), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.updatedAt))
    .limit(1);
  if (!task) throw new Error("No task found for proof");

  const cloudBefore = await cloudLastSyncId();
  const localBefore = await localSyncEventsMax();
  const marker = `leader-proof-${Date.now()}`;
  const nextTitle = `${task.title ?? "Task"} ${marker}`;

  console.log("task_id", task.id);
  console.log("cloud_last_sync_id_before", cloudBefore);
  console.log("local_sync_events_max_before", localBefore);

  const patchResponse = await fetch(`${apiBase}/api/v1/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: nextTitle }),
  });
  const patchBody = await patchResponse.text();
  if (!patchResponse.ok) {
    throw new Error(`PATCH failed (${patchResponse.status}): ${patchBody}`);
  }

  const cloudAfter = await cloudLastSyncId();
  const localAfter = await localSyncEventsMax();

  const [row] = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, ws), eq(tasks.id, task.id)))
    .limit(1);

  const newEvents = await db
    .select({ cursor: syncEvents.cursor, payload: syncEvents.payload })
    .from(syncEvents)
    .where(and(eq(syncEvents.workspaceId, ws), gt(syncEvents.cursor, localBefore)))
    .orderBy(desc(syncEvents.cursor));

  console.log("patch_status", patchResponse.status);
  console.log("local_row_title", row?.title);
  console.log("cloud_last_sync_id_after", cloudAfter);
  console.log("local_sync_events_max_after", localAfter);
  console.log(
    "local_sync_events_appended",
    newEvents.length > 0 ? newEvents.map((event) => event.cursor) : "none",
  );
  console.log("cloud_advanced", cloudAfter > cloudBefore);
  console.log("local_cursor_unchanged", localAfter === localBefore);
  console.log("row_matches_patch", row?.title === nextTitle);

  if (cloudAfter <= cloudBefore) {
    throw new Error("cloud last_sync_id did not advance");
  }
  if (localAfter !== localBefore) {
    throw new Error("local sync_events cursor advanced (fork append)");
  }
  if (row?.title !== nextTitle) {
    throw new Error("local task row does not match applied patch");
  }

  console.log("PROOF_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
