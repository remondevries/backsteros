import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../../db/index.js";
import { replicationReconcileMismatches } from "../../db/schema.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { getCoreReplicationConfig } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { tableExists, toIso } from "./cursors.js";
import { listActiveReplicatedTables } from "./fetch.js";
import { isReplicationReconcileEnabled } from "./reconcile-gate.js";
import {
  getTableSpec,
  rowIdFromPk,
  type KnownTable,
  type TableSpec,
} from "./tables.js";
import type {
  ReplicationApplyRequest,
  ReplicationApplyResponse,
  ReplicationChange,
  ReplicationRow,
  TableFingerprint,
} from "./types.js";
import { applyRemoteChanges } from "./apply.js";

export { isReplicationReconcileEnabled } from "./reconcile-gate.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;

let lastReconcileAt = 0;

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

function rowKeyExpr(spec: TableSpec): string {
  if (spec.pk.length === 1) {
    return `"${spec.pk[0]}"::text`;
  }
  return `(${spec.pk.map((col) => `coalesce("${col}"::text, '')`).join(" || '|' || ")})`;
}

export async function computeTableFingerprint(
  table: KnownTable,
): Promise<TableFingerprint | null> {
  const spec = getTableSpec(table);
  if (!spec || !(await tableExists(spec.name))) {
    return null;
  }
  const keyExpr = rowKeyExpr(spec);
  const updatedCol = spec.updatedAtColumn;
  const rows = (await sqlClient.unsafe(
    `
      SELECT
        ${keyExpr} AS row_key,
        "${updatedCol}" AS updated_at
      FROM "${spec.name}"
      ORDER BY 1
    `,
  )) as Array<{ row_key: string; updated_at: Date | string }>;

  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(row.row_key);
    hash.update("|");
    hash.update(toIso(row.updated_at));
    hash.update("\n");
  }
  return {
    table: spec.name,
    count: rows.length,
    fingerprint: hash.digest("hex"),
  };
}

export async function listReplicationRowKeys(
  table: KnownTable,
): Promise<string[]> {
  const spec = getTableSpec(table);
  if (!spec || !(await tableExists(spec.name))) {
    return [];
  }
  const keyExpr = rowKeyExpr(spec);
  const rows = (await sqlClient.unsafe(
    `SELECT ${keyExpr} AS row_key FROM "${spec.name}" ORDER BY 1`,
  )) as Array<{ row_key: string }>;
  return rows.map((row) => row.row_key);
}

export async function fetchLocalRowsByKeys(
  table: KnownTable,
  keys: string[],
): Promise<ReplicationChange[]> {
  const spec = getTableSpec(table);
  if (!spec || keys.length === 0 || !(await tableExists(spec.name))) {
    return [];
  }
  const keyExpr = rowKeyExpr(spec);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const rows = (await sqlClient.unsafe(
    `SELECT row_to_json(t) AS row FROM (
       SELECT * FROM "${spec.name}" WHERE ${keyExpr} IN (${placeholders})
     ) t`,
    keys as never[],
  )) as Array<{ row: ReplicationRow }>;
  return rows.map((entry) => ({
    table: spec.name,
    row: entry.row,
  }));
}

export type ReconcileMismatchSummary = {
  tableName: string;
  localCount: number;
  peerCount: number;
  missingLocally: number;
  missingOnPeer: number;
  checkedAt: string;
};

export async function listReplicationReconcileMismatches(): Promise<
  ReconcileMismatchSummary[]
> {
  const rows = await db.select().from(replicationReconcileMismatches);
  return rows.map((row) => ({
    tableName: row.tableName,
    localCount: row.localCount,
    peerCount: row.peerCount,
    missingLocally: row.missingLocally,
    missingOnPeer: row.missingOnPeer,
    checkedAt: row.checkedAt.toISOString(),
  }));
}

async function fetchPeerFingerprint(
  peerUrl: string,
  secret: string,
  table: string,
): Promise<TableFingerprint> {
  const url = new URL(`${peerUrl}/internal/core-replication/table-fingerprint`);
  url.searchParams.set("table", table);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: replicationHeaders(secret),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `peer fingerprint ${table} failed (${response.status}): ${body}`,
      );
    }
    return (await response.json()) as TableFingerprint;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPeerRowKeys(
  peerUrl: string,
  secret: string,
  table: string,
): Promise<string[]> {
  const url = new URL(`${peerUrl}/internal/core-replication/table-keys`);
  url.searchParams.set("table", table);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: replicationHeaders(secret),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `peer table-keys ${table} failed (${response.status}): ${body}`,
      );
    }
    const payload = (await response.json()) as { keys: string[] };
    return payload.keys ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPeerRowsByKeys(
  peerUrl: string,
  secret: string,
  table: string,
  keys: string[],
): Promise<ReplicationChange[]> {
  if (keys.length === 0) return [];
  const url = new URL(`${peerUrl}/internal/core-replication/rows`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: replicationHeaders(secret),
      body: JSON.stringify({ table, keys }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `peer rows ${table} failed (${response.status}): ${body}`,
      );
    }
    const payload = (await response.json()) as { changes: ReplicationChange[] };
    return payload.changes ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function pushChangesToPeer(
  peerUrl: string,
  secret: string,
  table: string,
  changes: ReplicationChange[],
): Promise<void> {
  if (changes.length === 0) return;
  const body: ReplicationApplyRequest = { table, changes };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${peerUrl}/internal/core-replication/apply`, {
      method: "POST",
      headers: replicationHeaders(secret),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`reconcile push ${table} failed (${response.status}): ${text}`);
    }
    const result = (await response.json()) as ReplicationApplyResponse;
    if (result.failed?.length) {
      appendOpsLog(
        "warn",
        `core replication reconcile push had failures ${table}`,
        `${result.failed.length} failed`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function reconcileTable(
  table: ReplicatedTable,
  peerUrl: string,
  secret: string,
): Promise<void> {
  const local = await computeTableFingerprint(table);
  if (!local) return;
  const peer = await fetchPeerFingerprint(peerUrl, secret, table);
  if (
    local.count === peer.count &&
    local.fingerprint === peer.fingerprint
  ) {
    await db
      .delete(replicationReconcileMismatches)
      .where(eq(replicationReconcileMismatches.tableName, table));
    return;
  }

  const localKeys = new Set(await listReplicationRowKeys(table));
  const peerKeys = new Set(await fetchPeerRowKeys(peerUrl, secret, table));
  const missingLocally = [...peerKeys].filter((key) => !localKeys.has(key));
  const missingOnPeer = [...localKeys].filter((key) => !peerKeys.has(key));

  await db
    .insert(replicationReconcileMismatches)
    .values({
      tableName: table,
      localCount: local.count,
      peerCount: peer.count,
      localFingerprint: local.fingerprint,
      peerFingerprint: peer.fingerprint,
      missingLocally: missingLocally.length,
      missingOnPeer: missingOnPeer.length,
      checkedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: replicationReconcileMismatches.tableName,
      set: {
        localCount: local.count,
        peerCount: peer.count,
        localFingerprint: local.fingerprint,
        peerFingerprint: peer.fingerprint,
        missingLocally: missingLocally.length,
        missingOnPeer: missingOnPeer.length,
        checkedAt: new Date(),
      },
    });

  appendOpsLog(
    "warn",
    `core replication reconcile mismatch ${table}`,
    `local=${local.count} peer=${peer.count} missingLocally=${missingLocally.length} missingOnPeer=${missingOnPeer.length}`,
  );

  // Enqueue: pull missing local rows from peer, push missing peer rows.
  const BATCH = 50;
  for (let i = 0; i < missingLocally.length; i += BATCH) {
    const batch = missingLocally.slice(i, i + BATCH);
    const changes = await fetchPeerRowsByKeys(peerUrl, secret, table, batch);
    if (changes.length > 0) {
      await applyRemoteChanges(table, changes, { direction: "pull" });
    }
  }
  for (let i = 0; i < missingOnPeer.length; i += BATCH) {
    const batch = missingOnPeer.slice(i, i + BATCH);
    const changes = await fetchLocalRowsByKeys(table, batch);
    await pushChangesToPeer(peerUrl, secret, table, changes);
  }
}

/**
 * Cheap hourly reconcile: fingerprint + id-set diff, enqueue missing rows.
 * No-op when disabled (tests / CORE_REPLICATION_RECONCILE=0) or when due
 * interval has not elapsed unless `force` is set.
 */
export async function runReplicationReconcile(options?: {
  force?: boolean;
}): Promise<void> {
  if (!isReplicationReconcileEnabled()) return;
  const config = getCoreReplicationConfig();
  if (!config) return;

  const now = Date.now();
  if (!options?.force && now - lastReconcileAt < RECONCILE_INTERVAL_MS) {
    return;
  }
  lastReconcileAt = now;

  const tables = await listActiveReplicatedTables();
  for (const table of tables) {
    try {
      await reconcileTable(table, config.peerUrl, config.secret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendOpsLog(
        "error",
        `core replication reconcile failed ${table}`,
        message,
      );
      console.error(`core replication reconcile failed ${table}`, error);
    }
  }
}

/** Test helper — reset the hourly gate. */
export function resetReconcileScheduleForTests(): void {
  lastReconcileAt = 0;
}

export function rowKeyFromRow(table: KnownTable, row: ReplicationRow): string {
  const spec = getTableSpec(table);
  if (!spec) return String(row.id ?? "");
  return rowIdFromPk(row, spec.pk);
}
