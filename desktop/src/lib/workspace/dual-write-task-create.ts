import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";
import type { Task as ApiTask } from "@backsteros/contracts";

import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

type NumberedRow = { id: string; number?: number | null };

/**
 * Ensure a local PowerSync create is also present on the REST API with the
 * same id, then mirror the server-assigned `number` into the API cache and
 * SQLite. Survives a stuck PowerSync CRUD queue (local-only orphans with
 * `number: null`).
 */
export async function dualWriteTaskCreateAndApplyNumber<T extends NumberedRow>(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    id: string;
    body: Record<string, unknown>;
    setters: Array<ApiRowsSetter<T>>;
  },
): Promise<number | null> {
  let created: ApiTask;
  try {
    created = await client.requestJson<ApiTask>("/api/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input.body, id: input.id }),
    });
  } catch (error) {
    // Already created (retry) — read back.
    if (error instanceof ApiClientError && error.status === 409) {
      try {
        created = await client.requestJson<ApiTask>(
          `/api/v1/tasks/${encodeURIComponent(input.id)}`,
        );
      } catch {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const number =
    typeof created.number === "number" && Number.isFinite(created.number)
      ? created.number
      : null;
  if (number == null) return null;

  for (const setter of input.setters) {
    setter((rows) => {
      if (!rows) return rows;
      return rows.map((entry) =>
        entry.id === input.id ? { ...entry, number } : entry,
      );
    });
  }
  if (powerSync.ready && powerSync.patchMetadata) {
    try {
      await powerSync.patchMetadata("tasks", input.id, { number });
    } catch (error) {
      console.warn("[desktop] dual-write number SQLite patch failed", error);
    }
  }
  return number;
}
