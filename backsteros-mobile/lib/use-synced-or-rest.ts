import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";
import { useLocalQuery } from "./use-local-query";

type UseSyncedOrRestOptions<TLocal extends Record<string, unknown>, TRow> = {
  sql: string;
  /** Bound parameters for the local watch (preferred over string interpolation). */
  params?: readonly unknown[];
  mapLocal: (rows: TLocal[]) => TRow[];
  /** REST fallback when PowerSync is not ready. */
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
 * Prefer PowerSync watch results; fall back to REST until sync is ready.
 * If local rows exist they win even while REST was previously loaded.
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

  const useRest = !powerSync.ready;

  const reloadRest = useCallback(async () => {
    if (powerSync.ready) return;
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
  }, [powerSync.ready]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const localRows = useMemo(
    () => mapLocalRef.current(syncedRows ?? []),
    [syncedRows],
  );

  const rows =
    localRows.length > 0
      ? localRows
      : !powerSync.ready || syncLoading
        ? restRows
        : localRows;

  const loading = rows.length === 0 && (useRest ? restLoading : syncLoading);
  const error = useRest && rows.length === 0 ? restError : null;

  const reload = useCallback(async () => {
    if (useRest) {
      await reloadRest();
      return;
    }
    await powerSync.retry();
  }, [powerSync, reloadRest, useRest]);

  return {
    rows,
    loading,
    error,
    useRest,
    restLoading,
    reload,
  };
}
