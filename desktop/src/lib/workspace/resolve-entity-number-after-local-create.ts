import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";

import type { SyncedMetadataTable } from "../powersync-context";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

type NumberedRow = { id: string; number?: number | null };

const FETCH_PATH_TABLES: Record<string, SyncedMetadataTable> = {
  tasks: "tasks",
  letters: "letters",
  meetings: "meetings",
  contacts: "contacts",
  organizations: "organizations",
  projects: "projects",
};

/** Map `/api/v1/{table}/:id` to the PowerSync metadata table name. */
export function metadataTableFromEntityFetchPath(
  fetchPath: string,
): SyncedMetadataTable | null {
  const match = fetchPath.match(/^\/api\/v1\/([a-z_]+)\//i);
  if (!match?.[1]) return null;
  return FETCH_PATH_TABLES[match[1].toLowerCase()] ?? null;
}

export function isRetryableEntityNumberLookupError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) {
    // Network / parse failures — keep polling.
    return true;
  }
  // 404: upload not applied yet. 401/403: auth race. 429/5xx: transient.
  return [401, 403, 404, 408, 429, 500, 502, 503, 504].includes(error.status);
}

const FOREGROUND_POLL_MS = 12_000;
const BACKGROUND_POLL_MS = 45_000;
const POLL_INTERVAL_MS = 200;

/**
 * Server assigns monotonic entity numbers on create. After a PowerSync local
 * insert (`number: null`), flush upload and read the assigned number back so
 * display ids and number-based routes work immediately.
 *
 * Writes the number into local SQLite (not only the API cache) — list merges
 * prefer PowerSync rows, so a cache-only update never reaches the UI.
 *
 * If the foreground poll times out (upload lag / auth blip), a background
 * poll keeps trying so KEY-N / IN-N still appear without recreating the task.
 */
export async function resolveEntityNumberAfterLocalCreate<
  T extends NumberedRow,
>(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  fetchPath: string,
  entityId: string,
  ...setRows: Array<ApiRowsSetter<T>>
): Promise<number | null> {
  const table = metadataTableFromEntityFetchPath(fetchPath);

  const applyNumber = async (number: number) => {
    for (const setter of setRows) {
      setter((rows) => {
        if (!rows) return rows;
        return rows.map((entry) =>
          entry.id === entityId ? { ...entry, number } : entry,
        );
      });
    }
    if (table && powerSync.ready && powerSync.patchMetadata) {
      try {
        await powerSync.patchMetadata(table, entityId, { number });
      } catch (error) {
        console.warn("[desktop] local entity number sync failed", error);
      }
    }
  };

  const tryFlush = async () => {
    if (!powerSync.flushCrudUpload) return;
    if (!powerSync.ready && !powerSync.connected) return;
    try {
      await powerSync.flushCrudUpload();
    } catch (error) {
      console.warn(
        "[desktop] entity create upload deferred",
        error instanceof Error ? error.message : error,
      );
    }
  };

  const pollUntil = async (deadlineMs: number): Promise<number | null> => {
    const deadline = Date.now() + deadlineMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      if (attempt > 0 && attempt % 10 === 0) {
        await tryFlush();
      }
      try {
        const row = await client.requestJson<{ number?: number | null }>(
          fetchPath,
        );
        if (typeof row.number === "number" && Number.isFinite(row.number)) {
          await applyNumber(row.number);
          return row.number;
        }
      } catch (error) {
        if (!isRetryableEntityNumberLookupError(error)) {
          console.warn("[desktop] entity number lookup failed", error);
          return null;
        }
      }
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return null;
  };

  await tryFlush();

  const number = await pollUntil(FOREGROUND_POLL_MS);
  if (number != null) return number;

  // Upload or auth may still be catching up — keep resolving without blocking
  // the create caller (list backfill also helps, but this is faster).
  void (async () => {
    await tryFlush();
    const late = await pollUntil(BACKGROUND_POLL_MS);
    if (late == null) {
      console.warn(
        "[desktop] entity number still pending after background poll",
        fetchPath,
      );
    }
  })();

  return null;
}
