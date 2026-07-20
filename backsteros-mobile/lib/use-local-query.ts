import { useEffect, useRef, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";
import { rowsShallowEqual } from "./rows-shallow-equal";

export { rowsShallowEqual } from "./rows-shallow-equal";

function paramsKey(params: readonly unknown[]): string {
  try {
    return JSON.stringify(params);
  } catch {
    return String(params.length);
  }
}

/** Watches a local SQLite query when PowerSync is ready; otherwise returns []. */
export function useLocalQuery<T extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
) {
  const { database, ready } = useMobilePowerSync();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dataRef = useRef(data);
  dataRef.current = data;
  const boundParams = useStableParams(params);

  useEffect(() => {
    if (!database) {
      setData([]);
      setIsLoading(false);
      return;
    }

    // Keep last local rows while syncing — clearing here caused list flicker
    // when `ready` briefly flipped during PowerSync status updates.
    if (!ready) {
      return;
    }

    const controller = new AbortController();
    if (dataRef.current.length === 0) {
      setIsLoading(true);
    }

    database.watch(
      sql,
      [...boundParams],
      {
        onResult: (result) => {
          const rows = (result.rows?._array ?? []) as T[];
          setData((previous) =>
            rowsShallowEqual(previous, rows) ? previous : rows,
          );
          setIsLoading(false);
        },
        onError: () => {
          setIsLoading(false);
        },
      },
      { signal: controller.signal },
    );

    return () => {
      controller.abort();
    };
  }, [boundParams, database, ready, sql]);

  return { data, isLoading: ready ? isLoading : false };
}

/** Stabilize param array identity when contents are equal. */
function useStableParams(params: readonly unknown[]): readonly unknown[] {
  const ref = useRef(params);
  if (paramsKey(ref.current) !== paramsKey(params)) {
    ref.current = params;
  }
  return ref.current;
}
