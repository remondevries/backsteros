import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";

export type MobileNumberResolvePowerSync = {
  connected: boolean;
  flushCrudUpload?: () => Promise<void>;
};

/**
 * Server assigns monotonic entity numbers on create. After a PowerSync local
 * insert (`number: null`), flush upload and read the assigned number back.
 */
export async function resolveEntityNumberAfterLocalCreate(
  client: BacksterosApiClient,
  powerSync: MobileNumberResolvePowerSync,
  fetchPath: string,
  onResolved?: (number: number) => void | Promise<void>,
): Promise<number | null> {
  if (!powerSync.connected || !powerSync.flushCrudUpload) return null;
  try {
    await powerSync.flushCrudUpload();
  } catch (error) {
    console.warn(
      "[mobile] entity create upload deferred",
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    try {
      const row = await client.requestJson<{ number?: number | null }>(
        fetchPath,
      );
      if (typeof row.number === "number") {
        await onResolved?.(row.number);
        return row.number;
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        // Upload not applied yet — retry.
      } else {
        console.warn("[mobile] entity number lookup failed", error);
        return null;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}
