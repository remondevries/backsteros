import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { getCoreReplicationConfig } from "./config.js";
import { applyRemoteChanges } from "./apply.js";
import {
  fetchLocalChanges,
  listActiveReplicatedTables,
} from "./fetch.js";
import { getReplicationCursor, setReplicationCursor } from "./cursors.js";
import { getChangesSince } from "./sync.js";
import type { ReplicatedTable } from "./constants.js";
import type { ReplicationApplyRequest, ReplicationChangesResponse } from "./types.js";
import { syncVaultWithPeer } from "./vault-replication.js";

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 100;

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

async function pullTable(table: ReplicatedTable) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  const cursor = await getReplicationCursor(table);
  const url = new URL(`${config.peerUrl}/internal/core-replication/changes`);
  url.searchParams.set("table", table);
  url.searchParams.set("since", cursor.updatedAt);
  url.searchParams.set("since_id", cursor.rowId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: replicationHeaders(config.secret),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`pull ${table} failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as ReplicationChangesResponse;
    if (payload.changes.length === 0) {
      return;
    }

    const result = await applyRemoteChanges(table, payload.changes);
    await setReplicationCursor(table, payload.cursor);
    appendOpsLog(
      "info",
      `core replication pull ${table}`,
      `${result.applied} applied, ${result.skipped} skipped (${config.role})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function pushTable(table: ReplicatedTable) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  let cursor = await getReplicationCursor(table);
  let pushed = 0;

  for (;;) {
    const { changes, cursor: nextCursor } = await fetchLocalChanges(table, cursor);
    if (changes.length === 0) {
      break;
    }

    const body: ReplicationApplyRequest = { table, changes };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${config.peerUrl}/internal/core-replication/apply`,
        {
          method: "POST",
          headers: replicationHeaders(config.secret),
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`push ${table} failed (${response.status}): ${text}`);
      }

      pushed += changes.length;
      cursor = nextCursor;
      await setReplicationCursor(table, cursor);

      if (changes.length < PAGE_SIZE) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (pushed > 0) {
    appendOpsLog(
      "info",
      `core replication push ${table}`,
      `${pushed} rows (${config.role})`,
    );
  }
}

export async function runCoreReplicationTick(): Promise<void> {
  const config = getCoreReplicationConfig();
  if (!config) return;

  const tables = await listActiveReplicatedTables();
  for (const table of tables) {
    try {
      await pullTable(table);
      await pushTable(table);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`core replication failed on table ${table}: ${message}`, {
        cause: error,
      });
    }
  }

  if (config.role === "local") {
    try {
      await syncVaultWithPeer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`core replication failed on vault: ${message}`, {
        cause: error,
      });
    }
  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export function startCoreReplicationWorker(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (workerTimer || !getCoreReplicationConfig()) {
    return;
  }

  const tick = () => {
    if (tickInFlight) {
      return;
    }
    tickInFlight = true;
    void runCoreReplicationTick()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("core replication tick failed", error);
        appendOpsLog("error", "core replication tick failed", message);
      })
      .finally(() => {
        tickInFlight = false;
      });
  };

  tick();
  workerTimer = setInterval(tick, intervalMs);
  appendOpsLog("info", "core replication worker started");
}

export function stopCoreReplicationWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

export { getChangesSince, applyRemoteChanges };
