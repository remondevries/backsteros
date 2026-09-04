import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";

import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

type NumberedRow = { id: string; number?: number | null };

/**
 * Server assigns monotonic entity numbers on create. After a PowerSync local
 * insert (`number: null`), flush upload and read the assigned number back so
 * display ids and number-based routes work immediately.
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
  if (!powerSync.connected) return null;
  try {
    await powerSync.flushCrudUpload();
  } catch (error) {
    console.warn(
      "[desktop] entity create upload deferred",
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  const applyNumber = (number: number) => {
    for (const setter of setRows) {
      setter((rows) => {
        if (!rows) return rows;
        return rows.map((entry) =>
          entry.id === entityId ? { ...entry, number } : entry,
        );
      });
    }
  };

  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    try {
      const row = await client.requestJson<{ number?: number | null }>(
        fetchPath,
      );
      if (typeof row.number === "number") {
        applyNumber(row.number);
        return row.number;
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        // Upload not applied yet — retry.
      } else {
        console.warn("[desktop] entity number lookup failed", error);
        return null;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}
