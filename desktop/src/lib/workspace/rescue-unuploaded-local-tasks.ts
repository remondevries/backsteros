import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";
import type { Task as ApiTask } from "@backsteros/contracts";

import type { WorkspacePowerSync } from "./workspace-data-types";
import { dualWriteTaskCreateAndApplyNumber } from "./dual-write-task-create";
import type { ApiRowsSetter } from "./workspace-data-types";

type LocalTaskRow = {
  id: string;
  number?: number | null;
  title?: string | null;
  status?: string | null;
  priority?: number | null;
  sortOrder?: number | null;
  projectId?: string | null;
  contactId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  dueEndDate?: string | null;
  inbox?: boolean | null;
  description?: string | null;
};

function entityNumberMissing(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "number" && (!Number.isFinite(value) || value <= 0))
  );
}

function toIsoDue(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

async function applyRemoteNumberToLocal<T extends LocalTaskRow>(
  powerSync: WorkspacePowerSync,
  localId: string,
  remote: ApiTask,
  setters: Array<ApiRowsSetter<T>>,
): Promise<void> {
  const number = remote.number;
  for (const setter of setters) {
    setter((rows) => {
      if (!rows) return [remote as unknown as T];
      if (!rows.some((entry) => entry.id === localId)) {
        return [remote as unknown as T, ...rows];
      }
      return rows.map((entry) =>
        entry.id === localId ? { ...entry, number } : entry,
      );
    });
  }
  if (powerSync.ready && powerSync.patchMetadata) {
    try {
      await powerSync.patchMetadata("tasks", localId, { number });
    } catch (error) {
      console.warn(
        "[desktop] rescue number SQLite patch failed",
        localId,
        error,
      );
    }
  }
}

/**
 * Local PowerSync creates that never uploaded stay at `number: null` and 404
 * on REST. Recreate them with the same client id so KEY-N / IN-N can appear.
 *
 * When REST already has the row (upload eventually landed, or a prior dual-write
 * succeeded) but SQLite still has `number: null`, copy the server number into
 * the API cache + SQLite. Skipping that left blank ID slots forever because
 * list merges are local-primary and list-only backfill misses stale caches.
 */
export async function rescueUnuploadedLocalTasks<T extends LocalTaskRow>(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  localRows: readonly T[] | null | undefined,
  setters: Array<ApiRowsSetter<T>>,
): Promise<number> {
  if (!localRows?.length) return 0;
  let rescued = 0;

  for (const local of localRows) {
    if (!entityNumberMissing(local.number)) continue;
    const title = local.title?.trim();
    if (!title) continue;

    let remote: ApiTask | null = null;
    try {
      remote = await client.requestJson<ApiTask>(
        `/api/v1/tasks/${encodeURIComponent(local.id)}`,
      );
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 404) {
        continue;
      }
    }

    if (remote) {
      const number =
        typeof remote.number === "number" && Number.isFinite(remote.number)
          ? remote.number
          : null;
      if (number == null) continue;
      await applyRemoteNumberToLocal(powerSync, local.id, remote, setters);
      rescued += 1;
      continue;
    }

    const body: Record<string, unknown> = {
      title,
      status: local.status ?? "ready_to_start",
      priority: local.priority ?? 0,
      sortOrder: local.sortOrder ?? Date.now(),
      projectId: local.projectId ?? null,
      contactId: local.contactId ?? null,
      assigneeId: local.assigneeId ?? null,
      dueDate: toIsoDue(local.dueDate ?? null),
      dueEndDate: toIsoDue(local.dueEndDate ?? null),
      inbox: Boolean(local.inbox ?? (!local.projectId && !local.contactId)),
      ...(local.description?.trim()
        ? { description: local.description.trim() }
        : {}),
    };

    try {
      const number = await dualWriteTaskCreateAndApplyNumber(
        client,
        powerSync,
        { id: local.id, body, setters },
      );
      if (number != null) rescued += 1;
    } catch (error) {
      console.warn(
        "[desktop] rescue unuploaded local task failed",
        local.id,
        error,
      );
    }
  }

  return rescued;
}
