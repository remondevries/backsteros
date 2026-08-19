import type {
  FinancialTransaction,
  UpdateFinancialTransactionInput,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchTransactions,
  patchTransaction,
  type TransactionFilters,
} from "./finance-api";
import { useMobileApiClient } from "./use-mobile-api-client";

type State = {
  transactions: FinancialTransaction[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
};

const INITIAL_STATE: State = {
  transactions: [],
  nextCursor: null,
  loading: true,
  loadingMore: false,
  refreshing: false,
  error: null,
};

function dedupeById(rows: FinancialTransaction[]): FinancialTransaction[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * Cursor-paginated transaction list (Tier C — REST only, no PowerSync).
 * Patches are optimistic: the row updates immediately and reverts on failure.
 */
export function useFinanceTransactions(filters: TransactionFilters) {
  const client = useMobileApiClient();
  const [state, setState] = useState<State>(INITIAL_STATE);

  // Serialize so effect deps track filter values, not object identity.
  const filterKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  // Guards against out-of-order responses when filters change quickly.
  const requestEpochRef = useRef(0);

  const loadFirstPage = useCallback(
    async (mode: "initial" | "refresh") => {
      const epoch = ++requestEpochRef.current;
      setState((prev) => ({
        ...prev,
        loading: mode === "initial",
        refreshing: mode === "refresh",
        error: null,
      }));
      try {
        const page = await fetchTransactions(client, {
          ...filtersRef.current,
          cursor: undefined,
        });
        if (requestEpochRef.current !== epoch) return;
        setState({
          transactions: dedupeById(page.transactions),
          nextCursor: page.nextCursor,
          loading: false,
          loadingMore: false,
          refreshing: false,
          error: null,
        });
      } catch (reason) {
        if (requestEpochRef.current !== epoch) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: reason instanceof Error ? reason.message : String(reason),
        }));
      }
    },
    [client],
  );

  useEffect(() => {
    void loadFirstPage("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFirstPage, filterKey]);

  const loadMore = useCallback(async () => {
    const cursor = state.nextCursor;
    if (!cursor || state.loading || state.loadingMore || state.refreshing) {
      return;
    }
    const epoch = requestEpochRef.current;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await fetchTransactions(client, {
        ...filtersRef.current,
        cursor,
      });
      if (requestEpochRef.current !== epoch) return;
      setState((prev) => ({
        ...prev,
        transactions: dedupeById([...prev.transactions, ...page.transactions]),
        nextCursor: page.nextCursor,
        loadingMore: false,
      }));
    } catch {
      if (requestEpochRef.current !== epoch) return;
      // Keep loaded pages; the footer spinner simply stops.
      setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }, [client, state.loading, state.loadingMore, state.nextCursor, state.refreshing]);

  const refresh = useCallback(() => loadFirstPage("refresh"), [loadFirstPage]);

  const applyPatch = useCallback(
    async (id: string, input: UpdateFinancialTransactionInput) => {
      let previous: FinancialTransaction | undefined;
      setState((prev) => ({
        ...prev,
        transactions: prev.transactions.map((row) => {
          if (row.id !== id) return row;
          previous = row;
          return { ...row, ...input } as FinancialTransaction;
        }),
      }));
      try {
        const updated = await patchTransaction(client, id, input);
        setState((prev) => ({
          ...prev,
          transactions: prev.transactions.map((row) =>
            row.id === id ? updated : row,
          ),
        }));
        return updated;
      } catch (reason) {
        const rollback = previous;
        if (rollback) {
          setState((prev) => ({
            ...prev,
            transactions: prev.transactions.map((row) =>
              row.id === id ? rollback : row,
            ),
          }));
        }
        throw reason;
      }
    },
    [client],
  );

  return useMemo(
    () => ({
      transactions: state.transactions,
      nextCursor: state.nextCursor,
      loading: state.loading,
      loadingMore: state.loadingMore,
      refreshing: state.refreshing,
      error: state.error,
      loadMore,
      refresh,
      applyPatch,
    }),
    [state, loadMore, refresh, applyPatch],
  );
}
