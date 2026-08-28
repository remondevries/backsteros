import { useCallback, useMemo, useRef, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";
import { resolveSyncedOrRestRows } from "./resolve-synced-or-rest-rows";
import { useLocalQuery } from "./use-local-query";
import { useRestListHydration } from "./use-rest-list-hydration";

export type UseSyncedOrRestOptions<TLocal extends Record<string, unknown>, TRow> = {
  sql: string;
  /** Bound parameters for the local watch (preferred over string interpolation). */
  params?: readonly unknown[];
  mapLocal: (rows: TLocal[]) => TRow[];
  /**
   * REST hydrate when SQLite is empty or PowerSync is disconnected.
   * Not used to merge over local rows while connected.
   */
  fetchRest: () => Promise<TRow[]>;
  /** When false, skip REST hydration (local SQLite watch only). */
  restEnabled?: boolean;
};

type UseSyncedOrRestResult<TRow> = {
  rows: TRow[];
  loading: boolean;
  error: string | null;
  /** True when the UI is primarily showing REST (sync offline or cold empty). */
  useRest: boolean;
  /**
   * True only while a user pull-to-refresh is in flight.
   * Bind RefreshControl to this — never to background hydration.
   */
  pullRefreshing: boolean;
  /** @deprecated Prefer `pullRefreshing` for RefreshControl. */
  restLoading: boolean;
  /** Pass `{ userPull: false }` for background hydrates after writes. */
  reload: (opts?: { userPull?: boolean }) => Promise<void>;
};

/**
 * Prefer live PowerSync watches when connected; fall back to REST membership
 * when the sync stream is offline or SQLite is still empty (cold-start rescue).
 */
export function useSyncedOrRest<
  TLocal extends Record<string, unknown>,
  TRow,
>({
  sql,
  params = [],
  mapLocal,
  fetchRest,
  restEnabled = true,
}: UseSyncedOrRestOptions<TLocal, TRow>): UseSyncedOrRestResult<TRow> {
  const powerSync = useMobilePowerSync();
  const { data: syncedRows, isLoading: syncLoading } = useLocalQuery<TLocal>(
    sql,
    params,
  );
  const [restRows, setRestRows] = useState<TRow[] | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const restRowsRef = useRef(restRows);
  restRowsRef.current = restRows;

  const mapLocalRef = useRef(mapLocal);
  mapLocalRef.current = mapLocal;
  const fetchRestRef = useRef(fetchRest);
  fetchRestRef.current = fetchRest;

  const localRows = useMemo(
    () => mapLocalRef.current(syncedRows ?? []),
    [syncedRows],
  );

  const reloadRest = useCallback(async (opts?: { userPull?: boolean }) => {
    if (!restEnabled) return;
    const userPull = opts?.userPull === true;
    if (userPull) {
      setPullRefreshing(true);
    } else if (restRowsRef.current == null) {
      // Cold start only — never spin RefreshControl for background hydrates.
      setRestLoading(true);
    }
    setRestError(null);
    try {
      setRestRows(await fetchRestRef.current());
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
      // Keep prior REST snapshot on transient failures.
    } finally {
      if (userPull) setPullRefreshing(false);
      setRestLoading(false);
    }
  }, [restEnabled]);

  useRestListHydration(reloadRest, restEnabled, localRows.length > 0);

  const rows = useMemo(
    () =>
      resolveSyncedOrRestRows({
        localRows,
        restRows,
        connected: powerSync.connected,
      }),
    [localRows, powerSync.connected, restRows],
  );

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

  const reload = useCallback(async (opts?: { userPull?: boolean }) => {
    // Default true so RefreshControl keepers keep their spinner.
    await reloadRest({ userPull: opts?.userPull !== false });
  }, [reloadRest]);

  return {
    rows,
    loading,
    error,
    useRest,
    pullRefreshing,
    restLoading: pullRefreshing,
    reload,
  };
}
