import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
} from "@backsteros/contracts";
import {
  accountReorderPatches,
  applyOptimisticAccountReorder,
  applyOptimisticCategoryReorder,
  applyOptimisticGoalReorder,
  applyOptimisticRecurringReorder,
  bankAccountMatchesSlug,
  categoryReorderPatches,
  getFinanceDashboardHref,
  getFinanceHref,
  getFinanceTransactionsHref,
  goalReorderPatches,
  isFinanceNavId,
  recurringReorderPatches,
  type FinanceGoalCreateInput,
  type FinanceGoalUpdateInput,
  type FinanceListReorderRequest,
  type FinanceNavId,
  type FinanceRecurringCreateInput,
  type FinanceRecurringUpdateInput,
} from "@backsteros/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDesktopAvatarSrcMap } from "../../lib/avatar-src";
import { uploadDesktopAvatar } from "../../lib/avatar-upload";
import { useDesktopPowerSync } from "../../lib/powersync-context";
import {
  createBankAccountViaPowerSyncOrApi,
  createFinancialCategoryViaPowerSyncOrApi,
  createFinancialGoalViaPowerSyncOrApi,
  createFinancialRecurringViaPowerSyncOrApi,
  deleteBankAccountViaPowerSyncOrApi,
  deleteFinancialCategoryViaPowerSyncOrApi,
  deleteFinancialGoalViaPowerSyncOrApi,
  deleteFinancialRecurringViaPowerSyncOrApi,
  updateBankAccountViaPowerSyncOrApi,
  updateFinancialCategoryViaPowerSyncOrApi,
  updateFinancialGoalViaPowerSyncOrApi,
  updateFinancialRecurringViaPowerSyncOrApi,
} from "../../lib/workspace/finance-mutations";
import { createMoneybirdBankLogoFile } from "../../assets/moneybird-bank-logo";
import {
  accountSlug,
  applyRecurringReorderGroup,
  notifyBankAccountsChanged,
  resolveRecurringReorderGroup,
} from "./finance-page-helpers";

/** String-href navigate used by finance page hooks (Phase 5c). */
export type FinanceHrefNavigate = (
  to: string,
  options?: { replace?: boolean; state?: unknown },
) => void;

type FinanceCoreCache = {
  accounts: BankAccount[];
  categories: FinancialCategory[];
  goals: FinancialGoal[];
  recurrings: FinancialRecurring[];
};

let financeCoreCache: FinanceCoreCache | null = null;

function writeFinanceCoreCache(next: Partial<FinanceCoreCache>): void {
  financeCoreCache = {
    accounts: next.accounts ?? financeCoreCache?.accounts ?? [],
    categories: next.categories ?? financeCoreCache?.categories ?? [],
    goals: next.goals ?? financeCoreCache?.goals ?? [],
    recurrings: next.recurrings ?? financeCoreCache?.recurrings ?? [],
  };
}

export function useFinanceCoreData({
  client,
  navigate,
  slug,
  sectionParam,
  routeActive = true,
}: {
  client: BacksterosApiClient;
  navigate: FinanceHrefNavigate;
  slug: string | undefined;
  sectionParam: string | undefined;
  routeActive?: boolean;
}) {
  const powerSync = useDesktopPowerSync();
  const [accounts, setAccounts] = useState<BankAccount[]>(
    () => financeCoreCache?.accounts ?? []);
  const [categories, setCategories] = useState<FinancialCategory[]>(
    () => financeCoreCache?.categories ?? []);
  const [goals, setGoals] = useState<FinancialGoal[]>(
    () => financeCoreCache?.goals ?? []);
  const [categoriesPending, setCategoriesPending] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [goalsPending, setGoalsPending] = useState(false);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [recurrings, setRecurrings] = useState<FinancialRecurring[]>(
    () => financeCoreCache?.recurrings ?? []);
  const [recurringsPending, setRecurringsPending] = useState(false);
  const [recurringsLoading, setRecurringsLoading] = useState(false);
  const [recurringsError, setRecurringsError] = useState<string | null>(null);

  const navId: FinanceNavId | null = isFinanceNavId(slug) ? slug : null;
  const allAccountsSelected = !slug || slug === "transactions";
  const selected =
    slug && !navId
      ? (accounts.find((account) => bankAccountMatchesSlug(account, slug)) ??
        null)
      : null;
  const showTransactions = allAccountsSelected || Boolean(selected);
  const selectionKey = allAccountsSelected
    ? "__all__"
    : (selected?.id ?? slug ?? null);
  const accountAvatarSrcById = useDesktopAvatarSrcMap("bank_account", accounts);

  const refreshAccounts = useCallback(async () => {
    const body = await client.requestJson<{ bankAccounts: BankAccount[] }>(
      "/api/v1/bank-accounts");
    setAccounts(body.bankAccounts);
    writeFinanceCoreCache({ accounts: body.bankAccounts });
    return body.bankAccounts;
  }, [client]);

  const refreshCategories = useCallback(async () => {
    const body = await client.requestJson<{ categories: FinancialCategory[] }>(
      "/api/v1/financial-categories");
    setCategories(body.categories);
    writeFinanceCoreCache({ categories: body.categories });
  }, [client]);

  const refreshGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const body = await client.requestJson<{ goals: FinancialGoal[] }>(
        "/api/v1/financial-goals");
      setGoals(body.goals);
      writeFinanceCoreCache({ goals: body.goals });
    } finally {
      setGoalsLoading(false);
    }
  }, [client]);

  const refreshRecurrings = useCallback(async () => {
    setRecurringsLoading(true);
    try {
      const body = await client.requestJson<{
        recurrings: FinancialRecurring[];
      }>("/api/v1/financial-recurrings");
      setRecurrings(body.recurrings);
      writeFinanceCoreCache({ recurrings: body.recurrings });
    } finally {
      setRecurringsLoading(false);
    }
  }, [client]);

  // Refresh core finance catalogs on mount / client change only — not on every
  // finance route slug (dashboard ↔ cashflow ↔ account) to avoid redundant fetches.
  useEffect(() => {
    void Promise.all([
      refreshAccounts().catch(() => setAccounts([])),
      refreshCategories().catch(() => setCategories([])),
      refreshGoals().catch(() => setGoals([])),
      refreshRecurrings().catch(() => setRecurrings([])),
    ]);
  }, [refreshAccounts, refreshCategories, refreshGoals, refreshRecurrings]);

  useEffect(() => {
    if (!routeActive) return;
    if (slug) return;
    navigate(getFinanceDashboardHref(), { replace: true });
  }, [navigate, routeActive, slug]);

  useEffect(() => {
    if (!routeActive) return;
    if (!slug || navId || accounts.length === 0) return;
    if (selected) return;
    // Unknown account slug → finance home.
    navigate(getFinanceDashboardHref(), { replace: true });
  }, [accounts.length, navId, navigate, routeActive, selected, slug]);

  useEffect(() => {
    if (!routeActive) return;
    if (!selected || !sectionParam) return;
    // Legacy /finance/:slug/imports (and other section) URLs → account root.
    navigate(getFinanceHref(accountSlug(selected)), {
      replace: true,
    });
  }, [navigate, routeActive, sectionParam, selected]);

  const handleCreateAccount = useCallback(
    async (input: {
      name: string;
      ibanOrMask: string | null;
      type: BankAccount["type"];
      currency?: string;
      moneybirdFinancialAccountId?: string | null;
      avatarFile?: File | null;
    }) => {
      const baseKey = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 24);
      const key = `${baseKey || "bank"}${Math.floor(Math.random() * 90 + 10)}`;
      const created = await createBankAccountViaPowerSyncOrApi(
        client,
        powerSync,
        {
          key,
          name: input.name,
          ibanOrMask: input.ibanOrMask,
          type: input.type,
          currency: input.currency ?? "EUR",
          moneybirdFinancialAccountId:
            input.moneybirdFinancialAccountId ?? null,
          sortOrder: Date.now(),
        },
      );
      let nextAccount = created;
      const avatarFile =
        input.avatarFile ??
        (input.moneybirdFinancialAccountId
          ? createMoneybirdBankLogoFile()
          : null);
      if (avatarFile) {
        const avatarResult = await uploadDesktopAvatar(
          client,
          "bank_account",
          created.id,
          avatarFile);
        if (avatarResult.ok) {
          const refreshed = await client.requestJson<BankAccount>(
            `/api/v1/bank-accounts/${encodeURIComponent(created.id)}`);
          nextAccount = refreshed;
        }
      }
      setAccounts((rows) =>
        rows.some((row) => row.id === nextAccount.id)
          ? rows.map((row) => (row.id === nextAccount.id ? nextAccount : row))
          : [...rows, nextAccount]);
      notifyBankAccountsChanged();
      navigate(getFinanceHref(accountSlug(nextAccount)));
    },
    [client, navigate, powerSync]);

  const handleSelectAccount = useCallback(
    (accountId: string) => {
      const next = accounts.find((entry) => entry.id === accountId);
      if (!next) return;
      navigate(getFinanceHref(accountSlug(next)));
    },
    [accounts, navigate]);

  const handleSelectAllAccounts = useCallback(() => {
    navigate(getFinanceTransactionsHref());
  }, [navigate]);

  const handleDeleteAccount = useCallback(
    async (accountId: string) => {
      await deleteBankAccountViaPowerSyncOrApi(client, powerSync, accountId);
      const remaining = accounts.filter((entry) => entry.id !== accountId);
      setAccounts(remaining);
      notifyBankAccountsChanged();
      if (selected?.id === accountId) {
        navigate(getFinanceHref(), { replace: true });
      }
    },
    [accounts, client, navigate, powerSync, selected?.id]);

  const handleUpdateAccount = useCallback(
    async (
      accountId: string,
      patch: {
        name?: string;
        ibanOrMask?: string | null;
        type?: BankAccount["type"];
        color?: string | null;
        currency?: string;
        moneybirdFinancialAccountId?: string | null;
        sortOrder?: number;
      }) => {
      const previous = accounts.find((row) => row.id === accountId) ?? null;
      const apiUpdated = await updateBankAccountViaPowerSyncOrApi(
        client,
        powerSync,
        accountId,
        patch,
      );
      let updated: BankAccount =
        apiUpdated ??
        ({
          ...previous!,
          ...patch,
          id: accountId,
          updatedAt: new Date().toISOString(),
        } as BankAccount);
      const linkedMoneybird =
        Boolean(updated.moneybirdFinancialAccountId) &&
        !previous?.moneybirdFinancialAccountId;
      if (linkedMoneybird && !updated.avatarStorageKey) {
        const avatarResult = await uploadDesktopAvatar(
          client,
          "bank_account",
          updated.id,
          createMoneybirdBankLogoFile(),
        );
        if (avatarResult.ok) {
          updated = await client.requestJson<BankAccount>(
            `/api/v1/bank-accounts/${encodeURIComponent(updated.id)}`,
          );
        }
      }
      setAccounts((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)));
      notifyBankAccountsChanged();
      return updated;
    },
    [accounts, client, powerSync]);

  const moneybirdLogoSeededRef = useRef(false);
  useEffect(() => {
    if (moneybirdLogoSeededRef.current) return;
    const missing = accounts.filter(
      (account) =>
        account.moneybirdFinancialAccountId && !account.avatarStorageKey,
    );
    if (missing.length === 0) return;
    moneybirdLogoSeededRef.current = true;
    let cancelled = false;
    void (async () => {
      let changed = false;
      for (const account of missing) {
        const result = await uploadDesktopAvatar(
          client,
          "bank_account",
          account.id,
          createMoneybirdBankLogoFile(),
        );
        if (result.ok) changed = true;
      }
      if (!cancelled && changed) {
        await refreshAccounts().catch(() => undefined);
        notifyBankAccountsChanged();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, client, refreshAccounts]);

  const handleReorderAccounts = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = accountReorderPatches(accounts, request);
      setAccounts((rows) => applyOptimisticAccountReorder(rows, request));
      for (const patch of patches) {
        void updateBankAccountViaPowerSyncOrApi(client, powerSync, patch.id, {
          type: patch.type,
          sortOrder: patch.sortOrder,
        })
          .then((updated) => {
            if (!updated) return;
            setAccounts((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
            notifyBankAccountsChanged();
          })
          .catch(() => {
            /* keep optimistic order; next refresh reconciles */
          });
      }
    },
    [accounts, client, powerSync]);

  const createCategory = useCallback(
    async (input: {
      name: string;
      kind: FinancialCategory["kind"];
      listing: FinancialCategory["listing"];
      parentId?: string | null;
    }) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        const created = await createFinancialCategoryViaPowerSyncOrApi(
          client,
          powerSync,
          {
            name: input.name,
            kind: input.kind,
            listing: input.listing,
            parentId: input.parentId ?? null,
            sortOrder: Date.now(),
          },
        );
        setCategories((rows) =>
          rows.some((row) => row.id === created.id)
            ? rows.map((row) => (row.id === created.id ? created : row))
            : [...rows, created],
        );
        await refreshCategories();
      } finally {
        setCategoriesPending(false);
      }
    },
    [client, powerSync, refreshCategories]);

  const updateCategory = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        kind?: FinancialCategory["kind"];
        listing?: FinancialCategory["listing"];
        icon?: string | null;
        budgetCents?: number | null;
        parentId?: string | null;
        sortOrder?: number;
      }) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        const updated = await updateFinancialCategoryViaPowerSyncOrApi(
          client,
          powerSync,
          id,
          patch,
        );
        setCategories((rows) =>
          rows.map((row) =>
            row.id === id
              ? ((updated ?? {
                  ...row,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                }) as FinancialCategory)
              : row,
          ),
        );
      } finally {
        setCategoriesPending(false);
      }
    },
    [client, powerSync]);

  const handleReorderCategories = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = categoryReorderPatches(categories, request);
      if (patches.length === 0) return;
      setCategories((rows) => applyOptimisticCategoryReorder(rows, request));
      for (const patch of patches) {
        const { id, ...body } = patch;
        void updateFinancialCategoryViaPowerSyncOrApi(
          client,
          powerSync,
          id,
          body,
        )
          .then((updated) => {
            if (!updated) return;
            setCategories((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [categories, client, powerSync]);

  const deleteCategory = useCallback(
    async (id: string) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        await deleteFinancialCategoryViaPowerSyncOrApi(client, powerSync, id);
        setCategories((rows) =>
          rows.filter((row) => row.id !== id && row.parentId !== id));
      } finally {
        setCategoriesPending(false);
      }
    },
    [client, powerSync]);

  const createGoal = useCallback(
    async (input: FinanceGoalCreateInput) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        const created = await createFinancialGoalViaPowerSyncOrApi(
          client,
          powerSync,
          {
            name: input.name,
            listing: input.listing,
            sortOrder: Date.now(),
          },
        );
        setGoals((rows) =>
          rows.some((row) => row.id === created.id)
            ? rows.map((row) => (row.id === created.id ? created : row))
            : [...rows, created],
        );
        await refreshGoals();
      } finally {
        setGoalsPending(false);
      }
    },
    [client, powerSync, refreshGoals]);

  const updateGoal = useCallback(
    async (id: string, patch: FinanceGoalUpdateInput) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        const updated = await updateFinancialGoalViaPowerSyncOrApi(
          client,
          powerSync,
          id,
          patch,
        );
        setGoals((rows) =>
          rows.map((row) =>
            row.id === id
              ? ((updated ?? {
                  ...row,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                }) as FinancialGoal)
              : row,
          ),
        );
      } finally {
        setGoalsPending(false);
      }
    },
    [client, powerSync]);

  const handleReorderGoals = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = goalReorderPatches(goals, request);
      setGoals((rows) => applyOptimisticGoalReorder(rows, request));
      for (const patch of patches) {
        void updateFinancialGoalViaPowerSyncOrApi(client, powerSync, patch.id, {
          listing: patch.listing,
          sortOrder: patch.sortOrder,
        })
          .then((updated) => {
            if (!updated) return;
            setGoals((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [client, goals, powerSync]);

  const deleteGoal = useCallback(
    async (id: string) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        await deleteFinancialGoalViaPowerSyncOrApi(client, powerSync, id);
        setGoals((rows) => rows.filter((row) => row.id !== id));
      } finally {
        setGoalsPending(false);
      }
    },
    [client, powerSync]);

  const createRecurring = useCallback(
    async (input: FinanceRecurringCreateInput) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        const created = await createFinancialRecurringViaPowerSyncOrApi(
          client,
          powerSync,
          {
            name: input.name,
            nextDate: input.nextDate,
            categoryId: input.categoryId ?? null,
            amountCents: input.amountCents ?? null,
            archived: input.archived ?? false,
            sortOrder: Date.now(),
          },
        );
        await refreshRecurrings();
        return { id: created.id };
      } finally {
        setRecurringsPending(false);
      }
    },
    [client, powerSync, refreshRecurrings]);

  const updateRecurring = useCallback(
    async (id: string, patch: FinanceRecurringUpdateInput) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        const updated = await updateFinancialRecurringViaPowerSyncOrApi(
          client,
          powerSync,
          id,
          patch,
        );
        setRecurrings((rows) =>
          rows.map((row) =>
            row.id === id
              ? ((updated ?? {
                  ...row,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                }) as FinancialRecurring)
              : row,
          ),
        );
      } finally {
        setRecurringsPending(false);
      }
    },
    [client, powerSync]);

  const handleReorderRecurrings = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = recurringReorderPatches(
        recurrings,
        request,
        resolveRecurringReorderGroup,
        applyRecurringReorderGroup);
      setRecurrings((rows) =>
        applyOptimisticRecurringReorder(
          rows,
          request,
          resolveRecurringReorderGroup,
          applyRecurringReorderGroup));
      for (const patch of patches) {
        const { id, ...body } = patch;
        void updateFinancialRecurringViaPowerSyncOrApi(
          client,
          powerSync,
          id,
          body,
        )
          .then((updated) => {
            if (!updated) return;
            setRecurrings((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [client, powerSync, recurrings]);

  const deleteRecurring = useCallback(
    async (id: string) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        await deleteFinancialRecurringViaPowerSyncOrApi(
          client,
          powerSync,
          id,
        );
        setRecurrings((rows) => rows.filter((row) => row.id !== id));
      } finally {
        setRecurringsPending(false);
      }
    },
    [client, powerSync]);

  return {
    accounts,
    categories,
    goals,
    recurrings,
    goalsLoading,
    recurringsLoading,
    categoriesPending,
    categoriesError,
    goalsPending,
    goalsError,
    recurringsPending,
    recurringsError,
    refreshAccounts,
    refreshCategories,
    refreshGoals,
    refreshRecurrings,
    navId,
    allAccountsSelected,
    selected,
    showTransactions,
    selectionKey,
    accountAvatarSrcById,
    handleCreateAccount,
    handleSelectAccount,
    handleSelectAllAccounts,
    handleDeleteAccount,
    handleUpdateAccount,
    handleReorderAccounts,
    createCategory,
    updateCategory,
    deleteCategory,
    handleReorderCategories,
    createGoal,
    updateGoal,
    deleteGoal,
    handleReorderGoals,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    handleReorderRecurrings,
  };
}
