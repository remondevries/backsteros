import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  BankAccount,
  FinancialImportBatch,
  FinancialImportResult,
  FinancialTransaction,
  MoneybirdBankAccountSyncResult,
  MoneybirdFinancialAccount,
} from "@backsteros/contracts";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  getFinanceHref,
  type FinanceAccountMetrics,
  type FinanceCategoryMetrics,
  type FinanceRecurringMetrics,
} from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { accountSlug } from "./finance-page-helpers";

/** String-href navigate used by finance page hooks (Phase 5c). */
export type FinanceHrefNavigate = (
  to: string,
  options?: { replace?: boolean; state?: unknown },
) => void;

const MONEYBIRD_SYNC_DEBOUNCE_MS = 60_000;

export function useFinanceTransactions({
  client,
  navigate,
  accounts,
  allAccountsSelected,
  selected,
  showTransactions,
  selectionKey,
  setReviewTransactions,
  setGoalTransactions,
  setCategoryMetrics,
  setAccountMetrics,
  setRecurringMetrics,
  refreshAccounts,
}: {
  client: BacksterosApiClient;
  navigate: FinanceHrefNavigate;
  accounts: BankAccount[];
  allAccountsSelected: boolean;
  selected: BankAccount | null;
  showTransactions: boolean;
  selectionKey: string | null;
  setReviewTransactions: Dispatch<SetStateAction<FinancialTransaction[]>>;
  setGoalTransactions: Dispatch<SetStateAction<FinancialTransaction[]>>;
  setCategoryMetrics: Dispatch<SetStateAction<FinanceCategoryMetrics | null>>;
  setAccountMetrics: Dispatch<SetStateAction<FinanceAccountMetrics | null>>;
  setRecurringMetrics: Dispatch<
    SetStateAction<FinanceRecurringMetrics | null>
  >;
  refreshAccounts?: () => Promise<unknown>;
}) {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [imports, setImports] = useState<FinancialImportBatch[]>([]);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [amountMinCents, setAmountMinCents] = useState<number | null>(null);
  const [amountMaxCents, setAmountMaxCents] = useState<number | null>(null);
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterOrganizationId, setFilterOrganizationId] = useState<
    string | null
  >(null);
  const [filterGoalId, setFilterGoalId] = useState<string | null>(null);
  const [filterRecurringId, setFilterRecurringId] = useState<string | null>(
    null,
  );
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvProgress, setCsvProgress] = useState<number | null>(null);
  const [lastImportResult, setLastImportResult] =
    useState<FinancialImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPending, setSelectAllPending] = useState(false);
  const lastClickedIdRef = useRef<string | null>(null);
  const [moneybirdAccounts, setMoneybirdAccounts] = useState<
    MoneybirdFinancialAccount[]
  >([]);
  const [moneybirdAccountsLoading, setMoneybirdAccountsLoading] =
    useState(false);
  const [moneybirdSyncPending, setMoneybirdSyncPending] = useState(false);
  const moneybirdSyncAtByAccountRef = useRef<Record<string, number>>({});
  const moneybirdSyncInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadTransactions = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      if (!showTransactions) {
        return {
          transactions: [] as FinancialTransaction[],
          nextCursor: null as string | null,
        };
      }
      // Scope: one bank account, or the workspace-wide "all accounts" list.
      const scopedAccountId = allAccountsSelected ? null : selected?.id ?? null;
      if (!allAccountsSelected && !scopedAccountId) {
        return {
          transactions: [] as FinancialTransaction[],
          nextCursor: null as string | null,
        };
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
        if (filterCategoryIds.includes(DROPDOWN_NONE_VALUE)) {
          params.set("uncategorized", "true");
        }
        const selectedCategoryIds = filterCategoryIds.filter(
          (id) => id !== DROPDOWN_NONE_VALUE,
        );
        if (selectedCategoryIds.length > 0) {
          params.set("categoryIds", selectedCategoryIds.join(","));
        }
        if (filterOrganizationId === DROPDOWN_NONE_VALUE) {
          params.set("unassignedOrg", "true");
        } else if (filterOrganizationId) {
          params.set("organizationId", filterOrganizationId);
        }
        if (filterGoalId === DROPDOWN_NO_GOAL_VALUE) {
          params.set("unassignedGoal", "true");
        } else if (filterGoalId) {
          params.set("goalId", filterGoalId);
        }
        if (filterRecurringId === DROPDOWN_NO_RECURRING_VALUE) {
          params.set("unassignedRecurring", "true");
        } else if (filterRecurringId) {
          params.set("recurringId", filterRecurringId);
        }
        params.set("limit", "200");
        if (opts?.cursor) params.set("cursor", opts.cursor);
        const path = scopedAccountId
          ? `/api/v1/bank-accounts/${encodeURIComponent(scopedAccountId)}/transactions?${params}`
          : `/api/v1/transactions?${params}`;
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(path);
        setTransactions((prev) =>
          opts?.append ? [...prev, ...body.transactions] : body.transactions,
        );
        setNextCursor(body.nextCursor);
        return body;
      } finally {
        setLoading(false);
      }
    },
    [
      allAccountsSelected,
      client,
      debouncedSearch,
      filterCategoryIds,
      filterGoalId,
      filterOrganizationId,
      filterRecurringId,
      selected?.id,
      showTransactions,
    ],
  );

  const loadImportsForAccount = useCallback(
    async (accountId: string) => {
      const body = await client.requestJson<{ imports: FinancialImportBatch[] }>(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}/imports`,
      );
      setImports(body.imports);
    },
    [client],
  );

  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
    setFilterCategoryIds([]);
    setFilterOrganizationId(null);
    setFilterGoalId(null);
    setFilterRecurringId(null);
    setSearch("");
    setDebouncedSearch("");
    setAmountMinCents(null);
    setAmountMaxCents(null);
    // Drop previous scope immediately so Select all never inherits another
    // account / "all accounts" page of rows.
    setTransactions([]);
    setNextCursor(null);
  }, [selectionKey]);

  // Filters change the visible set — drop any selection from the prior query.
  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, [
    amountMinCents,
    amountMaxCents,
    debouncedSearch,
    filterCategoryIds,
    filterGoalId,
    filterOrganizationId,
    filterRecurringId,
  ]);

  useEffect(() => {
    if (!showTransactions) return;
    if (!allAccountsSelected && !selected) return;
    void loadTransactions();
  }, [loadTransactions, selectionKey, showTransactions]);

  useEffect(() => {
    let cancelled = false;
    setMoneybirdAccountsLoading(true);
    void client
      .requestJson<{ financialAccounts: MoneybirdFinancialAccount[] }>(
        "/api/v1/finance/moneybird/financial-accounts",
      )
      .then((body) => {
        if (cancelled) return;
        setMoneybirdAccounts(body.financialAccounts ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMoneybirdAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setMoneybirdAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const syncMoneybirdAccount = useCallback(
    async (opts?: { force?: boolean; accountId?: string }) => {
      const accountId = opts?.accountId ?? selected?.id ?? null;
      if (!accountId) return null;
      const account =
        accounts.find((entry) => entry.id === accountId) ??
        (selected?.id === accountId ? selected : null);
      if (!account?.moneybirdFinancialAccountId) return null;

      const lastAt = moneybirdSyncAtByAccountRef.current[accountId] ?? 0;
      if (
        !opts?.force &&
        Date.now() - lastAt < MONEYBIRD_SYNC_DEBOUNCE_MS
      ) {
        return null;
      }
      if (moneybirdSyncInFlightRef.current === accountId) return null;

      moneybirdSyncInFlightRef.current = accountId;
      setMoneybirdSyncPending(true);
      try {
        const result = await client.requestJson<MoneybirdBankAccountSyncResult>(
          `/api/v1/bank-accounts/${encodeURIComponent(accountId)}/moneybird-sync`,
          { method: "POST" },
        );
        moneybirdSyncAtByAccountRef.current[accountId] = Date.now();
        if (result.inserted > 0) {
          await loadTransactions();
        }
        await refreshAccounts?.().catch(() => undefined);
        return result;
      } catch {
        return null;
      } finally {
        if (moneybirdSyncInFlightRef.current === accountId) {
          moneybirdSyncInFlightRef.current = null;
        }
        setMoneybirdSyncPending(false);
      }
    },
    [accounts, client, loadTransactions, refreshAccounts, selected],
  );

  useEffect(() => {
    if (!showTransactions) return;
    if (allAccountsSelected || !selected?.moneybirdFinancialAccountId) {
      return;
    }
    void syncMoneybirdAccount();
  }, [
    allAccountsSelected,
    selected?.id,
    selected?.moneybirdFinancialAccountId,
    showTransactions,
    syncMoneybirdAccount,
  ]);

  useEffect(() => {
    if (!importOpen) return;
    const targetId = importAccountId ?? selected?.id ?? null;
    if (!targetId) {
      setImports([]);
      return;
    }
    void loadImportsForAccount(targetId).catch(() => setImports([]));
  }, [importAccountId, importOpen, loadImportsForAccount, selected?.id]);

  const handleImportCsv = useCallback(async () => {
    const accountId = importAccountId ?? selected?.id ?? null;
    if (!accountId || !csvFile) return;
    setCsvUploading(true);
    setCsvProgress(0);
    setImportError(null);
    try {
      const result = await client.uploadBankAccountCsv(
        accountId,
        csvFile,
        csvFile.name,
        {
          onProgress: (event) => setCsvProgress(event.ratio),
        },
      );
      setLastImportResult(result);
      setCsvFile(null);
      await loadImportsForAccount(accountId);
      if (allAccountsSelected || selected?.id === accountId) {
        await loadTransactions();
      } else {
        const target = accounts.find((entry) => entry.id === accountId);
        if (target) {
          navigate(getFinanceHref(accountSlug(target)));
        }
      }
    } catch (reason) {
      setImportError(
        reason instanceof Error ? reason.message : "Could not import CSV.",
      );
    } finally {
      setCsvUploading(false);
      setCsvProgress(null);
    }
  }, [
    accounts,
    allAccountsSelected,
    client,
    csvFile,
    importAccountId,
    loadImportsForAccount,
    loadTransactions,
    navigate,
    selected?.id,
  ]);

  const handleToggleSelected = useCallback(
    (id: string, shiftKey: boolean, orderedIds: readonly string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClickedIdRef.current) {
          const start = orderedIds.indexOf(lastClickedIdRef.current);
          const end = orderedIds.indexOf(id);
          if (start >= 0 && end >= 0) {
            const [from, to] = start < end ? [start, end] : [end, start];
            for (let i = from; i <= to; i++) next.add(orderedIds[i]!);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastClickedIdRef.current = id;
    },
    [],
  );

  const handleSetGroupSelected = useCallback(
    (ids: string[], selected: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selected) {
          for (const id of ids) next.add(id);
        } else {
          for (const id of ids) next.delete(id);
        }
        return next;
      });
      lastClickedIdRef.current = ids[ids.length - 1] ?? null;
    },
    [],
  );

  const handleSelectAllTransactions = useCallback(async () => {
    if (selectAllPending) return;
    const scopedAccountId = allAccountsSelected ? null : selected?.id ?? null;
    if (!allAccountsSelected && !scopedAccountId) return;
    setSelectAllPending(true);
    try {
      // Reload from page 1 with the current account + filters so we never keep
      // rows from a previous "all accounts" (or other) scope, then page through
      // the rest of that same filtered list.
      const first = await loadTransactions({ cursor: null, append: false });
      const ids = new Set<string>();
      const addScoped = (rows: FinancialTransaction[]) => {
        for (const tx of rows) {
          if (scopedAccountId && tx.bankAccountId !== scopedAccountId) continue;
          // Amount range is client-only — keep Select all aligned with the list.
          if (amountMinCents != null && tx.amountCents < amountMinCents) {
            continue;
          }
          if (amountMaxCents != null && tx.amountCents > amountMaxCents) {
            continue;
          }
          ids.add(tx.id);
        }
      };
      addScoped(first.transactions);
      let cursor = first.nextCursor;
      let pages = 0;
      while (cursor && pages < 100) {
        pages += 1;
        const page = await loadTransactions({ cursor, append: true });
        addScoped(page.transactions);
        cursor = page.nextCursor;
      }
      setSelectedIds(ids);
      lastClickedIdRef.current = [...ids].at(-1) ?? null;
    } finally {
      setSelectAllPending(false);
    }
  }, [
    allAccountsSelected,
    amountMaxCents,
    amountMinCents,
    loadTransactions,
    selectAllPending,
    selected?.id,
  ]);

  const applyLocalPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      const idSet = new Set(ids);
      setTransactions((rows) =>
        rows.flatMap((row) => {
          if (!idSet.has(row.id)) return [row];
          const next = {
            ...row,
            ...(patch.bankAccountId !== undefined
              ? { bankAccountId: patch.bankAccountId }
              : {}),
            ...(patch.organizationId !== undefined
              ? { organizationId: patch.organizationId }
              : {}),
            ...(patch.projectId !== undefined
              ? { projectId: patch.projectId }
              : {}),
            ...(patch.categoryId !== undefined
              ? { categoryId: patch.categoryId }
              : {}),
            ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
            ...(patch.recurringId !== undefined
              ? { recurringId: patch.recurringId }
              : {}),
            ...(patch.displayName !== undefined
              ? { displayName: patch.displayName }
              : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          };
          // Leave the current account list when a row is moved elsewhere.
          if (
            selected &&
            patch.bankAccountId != null &&
            patch.bankAccountId !== selected.id
          ) {
            return [];
          }
          return [next];
        }),
      );
    },
    [selected],
  );

  const postTransactionBatch = useCallback(
    async (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      // API zod: ids.max(500) — same chunking as bulk delete.
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        await client.requestJson("/api/v1/transactions/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: chunk, patch }),
        });
      }
    },
    [client],
  );

  const handlePatchTransaction = useCallback(
    async (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      applyLocalPatch([id], patch);
      await client.requestJson(`/api/v1/transactions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [applyLocalPatch, client],
  );

  const handleBulkPatch = useCallback(
    async (patch: {
      bankAccountId?: string;
      organizationId?: string | null;
      projectId?: string | null;
      categoryId?: string | null;
      goalId?: string | null;
      recurringId?: string | null;
    }) => {
      const ids = [...selectedIds];
      if (!ids.length) return;
      applyLocalPatch(ids, patch);
      // API caps batch ids at 500 (same as batch-delete).
      await postTransactionBatch(ids, patch);
      // Keep selection so another property can be set without re-selecting.
    },
    [applyLocalPatch, postTransactionBatch, selectedIds],
  );

  const deleteTransactionsByIds = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      // Chunk to the API max of 500 ids per request.
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        await client.requestJson("/api/v1/transactions/batch-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: chunk }),
        });
      }
      setTransactions((rows) => rows.filter((row) => !idSet.has(row.id)));
      setReviewTransactions((rows) =>
        rows.filter((row) => !idSet.has(row.id)),
      );
      setGoalTransactions((rows) => rows.filter((row) => !idSet.has(row.id)));
      setCategoryMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.filter(
                (tx) => !idSet.has(tx.id),
              ),
            }
          : current,
      );
      setAccountMetrics((current) => {
        if (!current) return current;
        const removed = current.transactions.filter((tx) => idSet.has(tx.id));
        const removedCents = removed.reduce(
          (sum, tx) => sum + tx.amountCents,
          0,
        );
        return {
          ...current,
          balanceCents: current.balanceCents - removedCents,
          transactions: current.transactions.filter((tx) => !idSet.has(tx.id)),
        };
      });
      setRecurringMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.filter(
                (tx) => !idSet.has(tx.id),
              ),
            }
          : current,
      );
    },
    [client],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    await deleteTransactionsByIds(ids);
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, [deleteTransactionsByIds, selectedIds]);

  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      await deleteTransactionsByIds([id]);
      setSelectedIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (lastClickedIdRef.current === id) {
        lastClickedIdRef.current = null;
      }
    },
    [deleteTransactionsByIds],
  );

  return {
    transactions,
    imports,
    importAccountId,
    setImportAccountId,
    nextCursor,
    loading,
    search,
    setSearch,
    amountMinCents,
    setAmountMinCents,
    amountMaxCents,
    setAmountMaxCents,
    filterCategoryIds,
    setFilterCategoryIds,
    filterOrganizationId,
    setFilterOrganizationId,
    filterGoalId,
    setFilterGoalId,
    filterRecurringId,
    setFilterRecurringId,
    csvFile,
    setCsvFile,
    csvUploading,
    csvProgress,
    setCsvProgress,
    lastImportResult,
    setLastImportResult,
    importError,
    setImportError,
    importOpen,
    setImportOpen,
    selectedIds,
    setSelectedIds,
    selectAllPending,
    loadTransactions,
    handleImportCsv,
    moneybirdAccounts,
    moneybirdAccountsLoading,
    moneybirdSyncPending,
    syncMoneybirdAccount,
    handleToggleSelected,
    handleSetGroupSelected,
    handleSelectAllTransactions,
    applyLocalPatch,
    postTransactionBatch,
    handlePatchTransaction,
    handleBulkPatch,
    handleBulkDelete,
    handleDeleteTransaction,
    deleteTransactionsByIds,
  };
}
