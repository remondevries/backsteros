import { useEffect, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";

/** Watches a local SQLite query when PowerSync is ready; otherwise returns []. */
export function useLocalQuery<T extends Record<string, unknown>>(sql: string) {
  const { database, ready } = useMobilePowerSync();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!database || !ready) {
      setData([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    database.watch(
      sql,
      [],
      {
        onResult: (result) => {
          const rows = (result.rows?._array ?? []) as T[];
          setData(rows);
          setIsLoading(false);
        },
        onError: () => {
          setData([]);
          setIsLoading(false);
        },
      },
      { signal: controller.signal },
    );

    return () => {
      controller.abort();
    };
  }, [database, ready, sql]);

  return { data, isLoading: ready ? isLoading : false };
}
