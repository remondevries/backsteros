import type { BankAccountCashflowMonth } from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";

import {
  fetchMoneybirdInvoiceRevenue,
  fetchWorkspaceCashflow,
} from "./finance-api";
import { mergeInvoiceRevenueWithAccountExpenses } from "./finance-chart-series";
import { useMobileApiClient } from "./use-mobile-api-client";

/**
 * Moneybird invoiced revenue merged with workspace account expenses
 * (desktop Invoices chart parity).
 */
export function useFinanceInvoiceRevenue(year: number) {
  const client = useMobileApiClient();
  const [months, setMonths] = useState<BankAccountCashflowMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const [revenue, cashflow] = await Promise.all([
          fetchMoneybirdInvoiceRevenue(client, year),
          fetchWorkspaceCashflow(client, year),
        ]);
        setMonths(
          mergeInvoiceRevenueWithAccountExpenses(
            revenue.months,
            cashflow.months,
          ),
        );
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, year],
  );

  useEffect(() => {
    void reload("initial");
  }, [reload]);

  return {
    months,
    loading,
    refreshing,
    error,
    refresh: () => reload("refresh"),
  };
}
