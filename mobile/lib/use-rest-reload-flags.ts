import { useCallback, useRef, useState } from "react";

type BeginOpts = { userPull?: boolean };

/**
 * Split cold-start / empty loading from user pull-to-refresh.
 * Background REST hydrates must never drive RefreshControl (that rubber-bands
 * lists and opens pull-to-reveal search on iPad).
 */
export function useRestReloadFlags() {
  const [restLoading, setRestLoading] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const hasSnapshotRef = useRef(false);

  const markHydrated = useCallback(() => {
    hasSnapshotRef.current = true;
  }, []);

  const beginReload = useCallback((opts?: BeginOpts) => {
    const userPull = opts?.userPull === true;
    if (userPull) {
      setPullRefreshing(true);
    } else if (!hasSnapshotRef.current) {
      setRestLoading(true);
    }
    return userPull;
  }, []);

  const endReload = useCallback((userPull: boolean) => {
    if (userPull) setPullRefreshing(false);
    setRestLoading(false);
  }, []);

  return {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  };
}
