import { useCallback, useMemo, useRef, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";
import { resolveSyncedOrRestRows } from "./resolve-synced-or-rest-rows";
import { useLocalQuery } from "./use-local-query";
import { useRestListHydration } from "./use-rest-list-hydration";

type UseSyncedOrRestOptions<TLocal extends Record<string, unknown>, TRow> = {
  sql: string;
  /** Bound parameters for the local watch (preferred over string interpolation). */
  params?: readonly unknown[];
  mapLocal: (rows: TLocal[]) => TRow[];
  /**
   * REST hydrate (desktop parity). Always fetched so filtered lists can drop
   * stale SQLite rows when the PowerSync stream is offline.
   */
  fetchRest: () => Promise<TRow[]>;
};

type UseSyncedOrRestResult<TRow> = {
  rows: TRow[];
  loading: boolean;
  error: string | null;
  /** True when the UI is primarily showing REST (sync offline or cold empty). */
  useRest: boolean;
  /** True while a REST fetch is in flight (for pull-to-refresh). */
  restLoading: boolean;
  reload: () => Promise<void>;
};

/**
 * Prefer live PowerSync watches when connected; fall back to REST membership
 * when the sync stream is offline so removals/updates from other clients show up.
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
  const [restRows, setRestRows] = useState<TRow[] | null>(null);
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

  const reloadRest = useCallback(async () => {
    setRestLoading(true);
    setRestError(null);
    try {
      setRestRows(await fetchRestRef.current());
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
      // Keep prior REST snapshot on transient failures.
    } finally {
      setRestLoading(false);
    }
  }, []);

  useRestListHydration(reloadRest);

  const rows = resolveSyncedOrRestRows({
    localRows,
    restRows,
    connected: powerSync.connected,
  });

  const useRest =
    (!powerSync.connected && restRows != null) ||
    (localRows.length === 0 && restRows != null);

  const waitingForSync =
    rows.length === 0 &&
    restRows == null &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading);

  const loading =
    rows.length === 0 && (restLoading || waitingForSync || syncLoading);
  const error =
    rows.length === 0 && restError && !powerSync.connected ? restError : null;

  const reload = useCallback(async () => {
    await reloadRest();
  }, [reloadRest]);

  return {
    rows,
    loading,
    error,
    useRest,
    restLoading,
    reload,
  };
}
