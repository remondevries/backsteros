import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";
import { useLocalQuery } from "./use-local-query";
import { useRestFallbackGate } from "./use-rest-fallback-gate";

type UseSyncedOrRestOptions<TLocal extends Record<string, unknown>, TRow> = {
  sql: string;
  /** Bound parameters for the local watch (preferred over string interpolation). */
  params?: readonly unknown[];
  mapLocal: (rows: TLocal[]) => TRow[];
  /**
   * REST fallback when PowerSync fails or takes too long on a cold device
   * (empty SQLite). Prefer waiting for sync before hitting the API.
   */
  fetchRest: () => Promise<TRow[]>;
};

type UseSyncedOrRestResult<TRow> = {
  rows: TRow[];
  loading: boolean;
  error: string | null;
  useRest: boolean;
  /** True while a REST fetch is in flight (for pull-to-refresh when `useRest`). */
  restLoading: boolean;
  reload: () => Promise<void>;
};

/**
 * Prefer PowerSync watch results; fall back to REST only after sync fails or
 * stalls — avoids a stampede of failed API calls while PowerSync is still
 * connecting on a fresh iPhone.
 */
export function useSyncedOrRest<
  TLocal extends Record<string, unknown>,
  TRow,
>({
  sql,
  params = [],
  mapLocal,
  fetchRest,
}: UseSyncedOrRestOptions<TLocal, TRow>): UseSyncedOrRestResult<TRow> {
  const powerSync = useMobilePowerSync();
  const { data: syncedRows, isLoading: syncLoading } = useLocalQuery<TLocal>(
    sql,
    params,
  );
  const [restRows, setRestRows] = useState<TRow[]>([]);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const mapLocalRef = useRef(mapLocal);
  mapLocalRef.current = mapLocal;
  const fetchRestRef = useRef(fetchRest);
  fetchRestRef.current = fetchRest;

  const localRows = useMemo(
    () => mapLocalRef.current(syncedRows ?? []),
    [syncedRows],
  );

  const useRest = useRestFallbackGate(localRows.length);

  const reloadRest = useCallback(async () => {
    setRestLoading(true);
    setRestError(null);
    try {
      setRestRows(await fetchRestRef.current());
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
      setRestRows([]);
    } finally {
      setRestLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const rows = localRows.length > 0 ? localRows : restRows;

  const waitingForSync =
    localRows.length === 0 &&
    !useRest &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading);

  const loading =
    rows.length === 0 &&
    (useRest ? restLoading : waitingForSync || syncLoading);
  const error = useRest && rows.length === 0 ? restError : null;

  const reload = useCallback(async () => {
    // Pull-to-refresh: refresh REST rows only. Never recreate PowerSync here —
    // overlapping OP-SQLite opens exhaust native threads on device.
    if (useRest) {
      await reloadRest();
    }
  }, [reloadRest, useRest]);

  return {
    rows,
    loading,
    error,
    useRest,
    restLoading,
    reload,
  };
}
