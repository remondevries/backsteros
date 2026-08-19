import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBankAccountCashflow } from "./finance-api";
import {
  buildAccountIncomeExpenseYearPoints,
  type IncomeExpenseYearPoint,
} from "./finance-chart-series";
import { useMobileApiClient } from "./use-mobile-api-client";

/** Per-account yearly income/expense chart data (desktop account detail). */
export function useBankAccountCashflow(accountId: string | undefined, year: number) {
  const client = useMobileApiClient();
  const [points, setPoints] = useState<IncomeExpenseYearPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epochRef = useRef(0);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!accountId) {
        setPoints([]);
        setLoading(false);
        return;
      }
      const epoch = ++epochRef.current;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const cashflow = await fetchBankAccountCashflow(client, accountId, year);
        if (epochRef.current !== epoch) return;
        setPoints(
          buildAccountIncomeExpenseYearPoints({
            year: cashflow.year,
            months: cashflow.months,
          }),
        );
        setError(null);
      } catch (reason) {
        if (epochRef.current !== epoch) return;
        setPoints([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (epochRef.current === epoch) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accountId, client, year],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  return useMemo(
    () => ({
      points,
      loading,
      refreshing,
      error,
      reload: () => load("refresh"),
    }),
    [error, load, loading, points, refreshing],
  );
}
