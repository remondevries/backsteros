import type { WorkspaceCashflow } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchWorkspaceCashflow } from "./finance-api";
import { asOfForMonthKey, monthKeyForDate } from "./finance-format";
import { useMobileApiClient } from "./use-mobile-api-client";

function asOfIsoForMonthKey(monthKey: string): string {
  const asOf = asOfForMonthKey(monthKey);
  return `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
}

/** Year cashflow aggregates for the Cash Flow section (desktop asOf parity). */
export function useFinanceCashflow(monthKey: string) {
  const client = useMobileApiClient();
  const year = Number(monthKey.slice(0, 4));
  const asOf = useMemo(() => asOfIsoForMonthKey(monthKey), [monthKey]);

  const [data, setData] = useState<WorkspaceCashflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        setData(await fetchWorkspaceCashflow(client, year, asOf));
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [asOf, client, year],
  );

  useEffect(() => {
    void reload("initial");
  }, [reload]);

  return {
    data,
    year,
    asOf,
    monthKey,
    loading,
    refreshing,
    error,
    refresh: () => reload("refresh"),
  };
}

export function currentCashflowMonthKey(): string {
  return monthKeyForDate(new Date());
}
