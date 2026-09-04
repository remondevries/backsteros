import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  CashflowPlannerEntry,
  CashflowPlannerEntryInput,
  FinanceSpendPanel,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import type { FinanceNavId } from "@backsteros/ui";
import { useCallback, useEffect, useState } from "react";
import { useDesktopPowerSync } from "../../lib/powersync-context";
import {
  createCashflowPlannerEntryViaPowerSyncOrApi,
  deleteCashflowPlannerEntryViaPowerSyncOrApi,
  updateCashflowPlannerEntryViaPowerSyncOrApi,
} from "../../lib/workspace/finance-mutations";

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function useFinanceCashflow({
  client,
  navId,
}: {
  client: BacksterosApiClient;
  navId: FinanceNavId | null;
}) {
  const powerSync = useDesktopPowerSync();
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

  const [plannerEntries, setPlannerEntries] = useState<CashflowPlannerEntry[]>(
    [],
  );
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [plannerPending, setPlannerPending] = useState(false);

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

  const refreshPlannerEntries = useCallback(async () => {
    setPlannerLoading(true);
    setPlannerError(null);
    try {
      const body = await client.requestJson<{
        entries: CashflowPlannerEntry[];
      }>("/api/v1/cashflow-planner-entries");
      setPlannerEntries(body.entries);
    } catch (error) {
      setPlannerEntries([]);
      setPlannerError(
        error instanceof Error
          ? error.message
          : "Failed to load planning scratchpad",
      );
    } finally {
      setPlannerLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (navId !== "cashflow") return;
    void refreshPlannerEntries();
  }, [navId, refreshPlannerEntries]);

  const createPlannerEntry = useCallback(
    async (input?: Partial<CashflowPlannerEntryInput>) => {
      setPlannerPending(true);
      setPlannerError(null);
      try {
        const created = await createCashflowPlannerEntryViaPowerSyncOrApi(
          client,
          powerSync,
          {
            entryType: input?.entryType ?? "expense",
            name: input?.name ?? "New row",
            amountCents: input?.amountCents ?? 0,
            dueDate: input?.dueDate ?? todayYmd(),
            groupLabel: input?.groupLabel ?? null,
            ...(input?.sortOrder !== undefined
              ? { sortOrder: input.sortOrder }
              : {}),
          },
        );
        setPlannerEntries((rows) =>
          [...rows, created].sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return a.name.localeCompare(b.name);
          }),
        );
        return created;
      } catch (error) {
        setPlannerError(
          error instanceof Error ? error.message : "Failed to add row",
        );
        return null;
      } finally {
        setPlannerPending(false);
      }
    },
    [client, powerSync],
  );

  const updatePlannerEntry = useCallback(
    async (id: string, patch: Partial<CashflowPlannerEntryInput>) => {
      setPlannerPending(true);
      setPlannerError(null);
      try {
        const updated = await updateCashflowPlannerEntryViaPowerSyncOrApi(
          client,
          powerSync,
          id,
          patch,
        );
        setPlannerEntries((rows) =>
          rows
            .map((row) =>
              row.id === id
                ? ((updated ?? {
                    ...row,
                    ...patch,
                    updatedAt: new Date().toISOString(),
                  }) as CashflowPlannerEntry)
                : row,
            )
            .sort((a, b) => {
              if (a.sortOrder !== b.sortOrder) {
                return a.sortOrder - b.sortOrder;
              }
              return a.name.localeCompare(b.name);
            }),
        );
        return (
          updated ??
          ({
            id,
            ...patch,
          } as CashflowPlannerEntry)
        );
      } catch (error) {
        setPlannerError(
          error instanceof Error ? error.message : "Failed to update row",
        );
        return null;
      } finally {
        setPlannerPending(false);
      }
    },
    [client, powerSync],
  );

  const reorderPlannerEntries = useCallback(
    async (
      patches: Array<{ id: string; patch: Partial<CashflowPlannerEntryInput> }>,
    ) => {
      if (patches.length === 0) return;
      setPlannerError(null);
      const byId = new Map(patches.map((entry) => [entry.id, entry.patch]));
      setPlannerEntries((rows) =>
        rows
          .map((row) => {
            const patch = byId.get(row.id);
            if (!patch) return row;
            return {
              ...row,
              ...patch,
              updatedAt: new Date().toISOString(),
            };
          })
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return a.name.localeCompare(b.name);
          }),
      );

      try {
        await Promise.all(
          patches.map(({ id, patch }) =>
            updateCashflowPlannerEntryViaPowerSyncOrApi(
              client,
              powerSync,
              id,
              patch,
            ),
          ),
        );
      } catch (error) {
        setPlannerError(
          error instanceof Error ? error.message : "Failed to reorder rows",
        );
        void refreshPlannerEntries();
      }
    },
    [client, powerSync, refreshPlannerEntries],
  );

  const deletePlannerEntry = useCallback(
    async (id: string) => {
      setPlannerPending(true);
      setPlannerError(null);
      try {
        await deleteCashflowPlannerEntryViaPowerSyncOrApi(
          client,
          powerSync,
          id,
        );
        setPlannerEntries((rows) => rows.filter((row) => row.id !== id));
      } catch (error) {
        setPlannerError(
          error instanceof Error ? error.message : "Failed to delete row",
        );
      } finally {
        setPlannerPending(false);
      }
    },
    [client, powerSync],
  );

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
    plannerEntries,
    plannerLoading,
    plannerError,
    plannerPending,
    createPlannerEntry,
    updatePlannerEntry,
    reorderPlannerEntries,
    deletePlannerEntry,
  };
}
