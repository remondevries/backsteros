import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { BacksterosApiClient } from "@backsteros/api-client";

import { useDesktopApi } from "./api-context";

export type DesktopResourceState<T> = {
  data: T | null;
  error: Error | null;
  /** True only when there is nothing to show yet (cold open). */
  loading: boolean;
  /** True while a fetch is in flight and prior/cached data remains visible. */
  refreshing: boolean;
  reload: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
};

/**
 * Desktop equivalent of Next `useApiResource`.
 * Keeps prior `data` on dependency changes (`refreshing`) instead of blanking.
 */
export function useDesktopResource<T>(
  load: (client: BacksterosApiClient, signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[] = [],
): DesktopResourceState<T> {
  const { client } = useDesktopApi();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const [localVersion, setLocalVersion] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (data === null) setLoading(true);
    else setRefreshing(true);
    setError(null);

    loadRef
      .current(client, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error ? reason : new Error("Request failed"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => controller.abort();
    // Caller owns reload deps; load is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, localVersion, ...dependencies]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => setLocalVersion((value) => value + 1),
    setData,
  };
}
