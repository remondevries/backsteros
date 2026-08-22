import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  FinanceSpendPanel,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import type { FinanceNavId } from "@backsteros/ui";
import { useCallback, useEffect, useState } from "react";

export function useFinanceCashflow({
  client,
  navId,
}: {
  client: BacksterosApiClient;
  navId: FinanceNavId | null;
}) {
  const [workspaceCashflow, setWorkspaceCashflow] =
    useState<WorkspaceCashflow | null>(null);
  const [workspaceCashflowLoading, setWorkspaceCashflowLoading] =
    useState(false);
  const [workspaceCashflowError, setWorkspaceCashflowError] = useState<
    string | null
  >(null);
  const [spendPanel, setSpendPanel] = useState<FinanceSpendPanel | null>(null);
  const [spendPanelLoading, setSpendPanelLoading] = useState(false);
  const [spendPanelMonth, setSpendPanelMonth] = useState<string | null>(null);
  const [cashflowChartMonth, setCashflowChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const handleCashflowMonthChange = useCallback((month: string) => {
    setCashflowChartMonth(month);
  }, []);

  useEffect(() => {
    if (navId !== "cashflow") return;
    let cancelled = false;
    const year = Number(cashflowChartMonth.slice(0, 4));
    const monthIndex = Number(cashflowChartMonth.slice(5, 7)) - 1;
    const now = new Date();
    const asOfDate =
      now.getFullYear() === year && now.getMonth() === monthIndex
        ? now
        : new Date(year, monthIndex + 1, 0);
    const asOf = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, "0")}-${String(asOfDate.getDate()).padStart(2, "0")}`;
    setWorkspaceCashflowLoading(true);
    setWorkspaceCashflowError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          year: String(year),
          asOf,
        });
        const body = await client.requestJson<WorkspaceCashflow>(
          `/api/v1/finance/cashflow?${params}`,
        );
        if (!cancelled) setWorkspaceCashflow(body);
      } catch (error) {
        if (!cancelled) {
          setWorkspaceCashflow(null);
          setWorkspaceCashflowError(
            error instanceof Error ? error.message : "Failed to load cash flow",
          );
        }
      } finally {
        if (!cancelled) setWorkspaceCashflowLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cashflowChartMonth, client, navId]);

  const fetchSpendPanel = useCallback(
    async (month: string) => {
      setSpendPanelLoading(true);
      try {
        const body = await client.requestJson<FinanceSpendPanel>(
          `/api/v1/finance/spend-panel?month=${encodeURIComponent(month)}`,
        );
        setSpendPanel(body);
        setSpendPanelMonth(body.month);
      } catch {
        setSpendPanel(null);
      } finally {
        setSpendPanelLoading(false);
      }
    },
    [client],
  );

  const handleOpenSpendPanel = useCallback(
    (month?: string) => {
      const next =
        month ??
        spendPanelMonth ??
        cashflowChartMonth ??
        workspaceCashflow?.asOf.slice(0, 7) ??
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      setSpendPanelMonth(next);
      void fetchSpendPanel(next);
    },
    [
      cashflowChartMonth,
      fetchSpendPanel,
      spendPanelMonth,
      workspaceCashflow?.asOf,
    ],
  );

  const handleCloseSpendPanel = useCallback(() => {
    setSpendPanelMonth(null);
  }, []);

  const handleSpendPanelMonthChange = useCallback(
    (month: string) => {
      setSpendPanelMonth(month);
      void fetchSpendPanel(month);
    },
    [fetchSpendPanel],
  );

  return {
    workspaceCashflow,
    workspaceCashflowLoading,
    workspaceCashflowError,
    cashflowChartMonth,
    handleCashflowMonthChange,
    spendPanel,
    spendPanelLoading,
    handleOpenSpendPanel,
    handleCloseSpendPanel,
    handleSpendPanelMonthChange,
  };
}
