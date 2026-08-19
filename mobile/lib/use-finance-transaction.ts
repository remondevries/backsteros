import type {
  FinancialTransaction,
  UpdateFinancialTransactionInput,
} from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";

import { fetchTransaction, patchTransaction } from "./finance-api";
import { useMobileApiClient } from "./use-mobile-api-client";

/**
 * Single Tier C transaction by id — loads via REST GET and supports optimistic
 * classification patches (category / merchant / goal / notes / display name).
 */
export function useFinanceTransaction(id: string | undefined) {
  const client = useMobileApiClient();
  const [transaction, setTransaction] = useState<FinancialTransaction | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) {
      setTransaction(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      setTransaction(await fetchTransaction(client, id));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setTransaction(null);
    } finally {
      setLoading(false);
    }
  }, [client, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const applyPatch = useCallback(
    async (input: UpdateFinancialTransactionInput) => {
      if (!id || !transaction) {
        throw new Error("Transaction not loaded");
      }
      const previous = transaction;
      setTransaction({ ...transaction, ...input } as FinancialTransaction);
      try {
        const updated = await patchTransaction(client, id, input);
        setTransaction(updated);
        return updated;
      } catch (reason) {
        setTransaction(previous);
        throw reason;
      }
    },
    [client, id, transaction],
  );

  return {
    transaction,
    loading,
    error,
    reload,
    applyPatch,
  };
}
