import { useEffect, useState } from "react";

import { useDesktopApi } from "./api-context";
import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import { shouldFetchTaskDescriptionViaRest } from "./should-fetch-task-description-via-rest";
import {
  fetchTaskDescription,
  peekTaskDescriptionCache,
  writeTaskDescriptionCache,
} from "./task-description-cache";

export {
  peekTaskDescriptionCache,
  writeTaskDescriptionCache,
} from "./task-description-cache";

/** One-row detail watch — list SQL still omits description. */
export const TASK_DESCRIPTION_SQL = `SELECT id, description FROM tasks WHERE id = ? AND deleted_at IS NULL LIMIT 1`;

type DescriptionRow = {
  id: string;
  description: string | null;
};

function asDescription(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Load task description from PowerSync (same as iOS detail SELECT).
 *
 * List SQL omits description — do not merge REST bodies into every list row.
 * REST only when SQLite has no row after the watch settles (cold empty DB).
 * Pass `enabled: keepAliveActive` so hidden keep-alive panes skip the watch.
 */
export function useDesktopTaskDescription(
  taskId: string | null | undefined,
  options?: {
    enabled?: boolean;
    /** Optional seed shown until local/REST settles. */
    seed?: string | null;
  },
): {
  description: string;
  loading: boolean;
  /** Update local + session cache after a successful save. */
  rememberDescription: (description: string) => void;
} {
  const enabled = options?.enabled !== false;
  const seed = options?.seed ?? null;
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const id = taskId?.trim() || null;

  const local = usePowerSyncQuery<DescriptionRow>(
    enabled && id ? TASK_DESCRIPTION_SQL : null,
    enabled && id ? [id] : [],
  );

  const syncLoading = Boolean(enabled && id && local.data === null);
  const localRow = local.data?.[0] ?? null;
  const hasLocalRow = Boolean(localRow);
  const localDescription = localRow
    ? asDescription(localRow.description)
    : null;

  const [activeId, setActiveId] = useState(id);
  const [override, setOverride] = useState<string | null>(null);
  const [restDescription, setRestDescription] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  if (id !== activeId) {
    setActiveId(id);
    setOverride(null);
    setRestDescription(null);
    setRestLoading(false);
  }

  const useRest =
    enabled &&
    shouldFetchTaskDescriptionViaRest({
      taskId: id,
      hasLocalRow,
      syncLoading,
      powerSyncReady: powerSync.ready,
      powerSyncStatus: powerSync.status,
    });

  useEffect(() => {
    if (!id || !enabled) return;
    if (localDescription == null) return;
    writeTaskDescriptionCache(id, localDescription);
  }, [enabled, id, localDescription]);

  useEffect(() => {
    if (!id || !enabled || !useRest) {
      setRestLoading(false);
      return;
    }

    let cancelled = false;
    setRestLoading(true);
    void fetchTaskDescription(client, id).then((next) => {
      if (cancelled) return;
      if (next != null) setRestDescription(next);
      setRestLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [client, enabled, id, useRest]);

  const cached = id ? peekTaskDescriptionCache(id) : null;
  const description =
    override ??
    localDescription ??
    restDescription ??
    cached ??
    (typeof seed === "string" ? seed : "");

  const loading = Boolean(
    enabled &&
      id &&
      override == null &&
      localDescription == null &&
      restDescription == null &&
      cached == null &&
      seed == null &&
      (syncLoading || (useRest && restLoading)),
  );

  return {
    description,
    loading,
    rememberDescription: (next: string) => {
      if (!id) return;
      writeTaskDescriptionCache(id, next);
      setOverride(next);
    },
  };
}
