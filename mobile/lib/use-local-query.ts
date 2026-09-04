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

/**
 * Watches a local SQLite query when the PowerSync database handle exists.
 * Does not wait for `hasSynced` — first-sync rows stream in as they arrive.
 */
export function useLocalQuery<T extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
) {
  const { database, status } = useMobilePowerSync();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dataRef = useRef(data);
  dataRef.current = data;
  const boundParams = useStableParams(params);

  // When there is no DB yet, mirror auth/open status into isLoading without
  // touching an active watch (status ticks must not abort/restart watches).
  useEffect(() => {
    if (database) return;
    setData([]);
    setIsLoading(status !== "error" && status !== "unauthenticated");
  }, [database, status]);

  useEffect(() => {
    if (!database) return;

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
        onError: (error) => {
          console.warn(
            "[mobile] local query error",
            sql.slice(0, 80).replace(/\s+/g, " "),
            error instanceof Error ? error.message : error,
          );
          setIsLoading(false);
        },
      },
      { signal: controller.signal },
    );

    return () => {
      controller.abort();
    };
  }, [boundParams, database, sql]);

  return { data, isLoading };
}

/** Stabilize param array identity when contents are equal. */
function useStableParams(params: readonly unknown[]): readonly unknown[] {
  const ref = useRef(params);
  if (paramsKey(ref.current) !== paramsKey(params)) {
    ref.current = params;
  }
  return ref.current;
}
