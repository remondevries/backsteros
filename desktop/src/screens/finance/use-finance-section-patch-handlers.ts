import { useCallback } from "react";

import type { useFinanceSectionData } from "./use-finance-section-data";
import type { useFinanceTransactions } from "./use-finance-transactions";

type FinanceSectionData = ReturnType<typeof useFinanceSectionData>;
type FinanceTransactionsData = ReturnType<typeof useFinanceTransactions>;

export function useFinanceSectionPatchHandlers({
  dashboardChartMonth,
  reviewTransactions,
  setReviewTransactions,
  setReviewTotalCount,
  refreshCategorySpend,
  categorySpendMonth,
  selectedCategoryId,
  fetchCategoryMetrics,
  setCategoryMetrics,
  selectedAccountId,
  fetchAccountMetrics,
  setAccountMetrics,
  setGoalTransactions,
  setRecurringMetrics,
  handlePatchTransaction,
  applyLocalPatch,
  postTransactionBatch,
}: Pick<
  FinanceSectionData,
  | "dashboardChartMonth"
  | "reviewTransactions"
  | "setReviewTransactions"
  | "setReviewTotalCount"
  | "refreshCategorySpend"
  | "categorySpendMonth"
  | "selectedCategoryId"
  | "fetchCategoryMetrics"
  | "setCategoryMetrics"
  | "selectedAccountId"
  | "fetchAccountMetrics"
  | "setAccountMetrics"
  | "setGoalTransactions"
  | "setRecurringMetrics"
> &
  Pick<
    FinanceTransactionsData,
    "handlePatchTransaction" | "applyLocalPatch" | "postTransactionBatch"
  >) {
  const handleDashboardTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      const current = reviewTransactions.find((row) => row.id === id);
      const next = current ? { ...current, ...patch } : null;
      const categoryChanged =
        Boolean(current) &&
        patch.categoryId !== undefined &&
        patch.categoryId !== current!.categoryId;
      const filed = Boolean(
        next && next.categoryId != null && next.organizationId != null,
      );

      setReviewTransactions((rows) =>
        rows.flatMap((row) => {
          if (row.id !== id) return [row];
          const updated = { ...row, ...patch };
          if (updated.categoryId != null && updated.organizationId != null) {
            return [];
          }
          return [updated];
        }),
      );
      // Review inbox is uncategorized — filing a category drops it from the total.
      if (
        patch.categoryId !== undefined &&
        patch.categoryId != null &&
        current?.categoryId == null
      ) {
        setReviewTotalCount((count) => Math.max(0, count - 1));
      }
      void (async () => {
        await handlePatchTransaction(id, patch);
        // Top categories follow the dashboard month picker — never the local
        // calendar month alone, or a different month's empty spend can wipe the widget.
        if (categoryChanged || filed) {
          void refreshCategorySpend(dashboardChartMonth).catch(() => {});
        }
      })();
    },
    [
      dashboardChartMonth,
      handlePatchTransaction,
      refreshCategorySpend,
      reviewTransactions,
    ],
  );

  const handleDashboardBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const shouldRefreshSpend = reviewTransactions.some((row) => {
        if (!idSet.has(row.id)) return false;
        const next = { ...row, ...patch };
        const categoryChanged =
          patch.categoryId !== undefined &&
          patch.categoryId !== row.categoryId;
        const filed =
          next.categoryId != null && next.organizationId != null;
        return categoryChanged || filed;
      });

      setReviewTransactions((rows) =>
        rows.flatMap((row) => {
          if (!idSet.has(row.id)) return [row];
          const next = { ...row, ...patch };
          if (next.categoryId != null && next.organizationId != null) {
            return [];
          }
          return [next];
        }),
      );
      if (patch.categoryId !== undefined && patch.categoryId != null) {
        const removed = reviewTransactions.filter(
          (row) => idSet.has(row.id) && row.categoryId == null,
        ).length;
        if (removed > 0) {
          setReviewTotalCount((count) => Math.max(0, count - removed));
        }
      }
      void (async () => {
        applyLocalPatch(ids, patch);
        await postTransactionBatch(ids, patch);
        if (shouldRefreshSpend) {
          void refreshCategorySpend(dashboardChartMonth).catch(() => {});
        }
      })();
    },
    [
      applyLocalPatch,
      dashboardChartMonth,
      postTransactionBatch,
      refreshCategorySpend,
      reviewTransactions,
    ],
  );

  const handleCategoryTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
      },
    ) => {
      // Optimistically reflect the change in the detail-panel list.
      setCategoryMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                tx.id === id ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      void (async () => {
        await handlePatchTransaction(id, patch);
        if (selectedCategoryId) {
          try {
            setCategoryMetrics(await fetchCategoryMetrics(selectedCategoryId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
        void refreshCategorySpend(categorySpendMonth ?? undefined).catch(
          () => {},
        );
      })();
    },
    [
      categorySpendMonth,
      fetchCategoryMetrics,
      handlePatchTransaction,
      refreshCategorySpend,
      selectedCategoryId,
    ],
  );

  const handleCategoryBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      // Optimistically reflect the change in the detail-panel list.
      setCategoryMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                idSet.has(tx.id) ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      void (async () => {
        applyLocalPatch(ids, patch);
        await postTransactionBatch(ids, patch);
        if (selectedCategoryId) {
          try {
            setCategoryMetrics(await fetchCategoryMetrics(selectedCategoryId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
        void refreshCategorySpend(categorySpendMonth ?? undefined).catch(
          () => {},
        );
      })();
    },
    [
      applyLocalPatch,
      categorySpendMonth,
      fetchCategoryMetrics,
      postTransactionBatch,
      refreshCategorySpend,
      selectedCategoryId,
    ],
  );

  const handleAccountTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
      },
    ) => {
      // Optimistically reflect the change; drop the row if it moved accounts.
      setAccountMetrics((current) => {
        if (!current) return current;
        if (patch.bankAccountId && patch.bankAccountId !== current.accountId) {
          const moved = current.transactions.find((tx) => tx.id === id);
          return {
            ...current,
            balanceCents: current.balanceCents - (moved?.amountCents ?? 0),
            transactions: current.transactions.filter((tx) => tx.id !== id),
          };
        }
        return {
          ...current,
          transactions: current.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...patch } : tx,
          ),
        };
      });
      void (async () => {
        await handlePatchTransaction(id, patch);
        if (selectedAccountId) {
          try {
            setAccountMetrics(await fetchAccountMetrics(selectedAccountId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
      })();
    },
    [fetchAccountMetrics, handlePatchTransaction, selectedAccountId],
  );

  const handleAccountBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setAccountMetrics((current) => {
        if (!current) return current;
        if (patch.bankAccountId && patch.bankAccountId !== current.accountId) {
          const removed = current.transactions.filter((tx) => idSet.has(tx.id));
          const removedCents = removed.reduce(
            (sum, tx) => sum + tx.amountCents,
            0,
          );
          return {
            ...current,
            balanceCents: current.balanceCents - removedCents,
            transactions: current.transactions.filter(
              (tx) => !idSet.has(tx.id),
            ),
          };
        }
        return {
          ...current,
          transactions: current.transactions.map((tx) =>
            idSet.has(tx.id) ? { ...tx, ...patch } : tx,
          ),
        };
      });
      void (async () => {
        applyLocalPatch(ids, patch);
        await postTransactionBatch(ids, patch);
        if (selectedAccountId) {
          try {
            setAccountMetrics(await fetchAccountMetrics(selectedAccountId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
      })();
    },
    [applyLocalPatch, fetchAccountMetrics, postTransactionBatch, selectedAccountId],
  );

  const handleGoalTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      setGoalTransactions((rows) =>
        rows.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)),
      );
      void handlePatchTransaction(id, patch);
    },
    [handlePatchTransaction],
  );

  const handleGoalBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setGoalTransactions((rows) =>
        rows.map((tx) => (idSet.has(tx.id) ? { ...tx, ...patch } : tx)),
      );
      applyLocalPatch(ids, patch);
      void postTransactionBatch(ids, patch);
    },
    [applyLocalPatch, postTransactionBatch],
  );

  const handleRecurringTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
      },
    ) => {
      setRecurringMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                tx.id === id ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      void handlePatchTransaction(id, patch);
    },
    [handlePatchTransaction],
  );

  const handleRecurringBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setRecurringMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                idSet.has(tx.id) ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      applyLocalPatch(ids, patch);
      void postTransactionBatch(ids, patch);
    },
    [applyLocalPatch, postTransactionBatch],
  );

  return {
    handleDashboardTransactionPatch,
    handleDashboardBulkPatch,
    handleCategoryTransactionPatch,
    handleCategoryBulkPatch,
    handleAccountTransactionPatch,
    handleAccountBulkPatch,
    handleGoalTransactionPatch,
    handleGoalBulkPatch,
    handleRecurringTransactionPatch,
    handleRecurringBulkPatch,
  };
}
