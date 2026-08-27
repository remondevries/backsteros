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
import { useCallback, useEffect, useState } from "react";
import { useDesktopAvatarSrcMap } from "../../lib/avatar-src";
import { uploadDesktopAvatar } from "../../lib/avatar-upload";
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
      avatarFile?: File | null;
    }) => {
      const baseKey = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 24);
      const key = `${baseKey || "bank"}${Math.floor(Math.random() * 90 + 10)}`;
      const created = await client.requestJson<BankAccount>(
        "/api/v1/bank-accounts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key,
            name: input.name,
            ibanOrMask: input.ibanOrMask,
            type: input.type,
            currency: "EUR",
            sortOrder: Date.now(),
          }),
        });
      let nextAccount = created;
      if (input.avatarFile) {
        const avatarResult = await uploadDesktopAvatar(
          client,
          "bank_account",
          created.id,
          input.avatarFile);
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
    [client, navigate]);

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
      await client.requestJson(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}`,
        { method: "DELETE" });
      const remaining = accounts.filter((entry) => entry.id !== accountId);
      setAccounts(remaining);
      notifyBankAccountsChanged();
      if (selected?.id === accountId) {
        navigate(getFinanceHref(), { replace: true });
      }
    },
    [accounts, client, navigate, selected?.id]);

  const handleUpdateAccount = useCallback(
    async (
      accountId: string,
      patch: {
        name?: string;
        ibanOrMask?: string | null;
        type?: BankAccount["type"];
        color?: string | null;
        sortOrder?: number;
      }) => {
      const updated = await client.requestJson<BankAccount>(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
      setAccounts((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)));
      notifyBankAccountsChanged();
      return updated;
    },
    [client]);

  const handleReorderAccounts = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = accountReorderPatches(accounts, request);
      setAccounts((rows) => applyOptimisticAccountReorder(rows, request));
      for (const patch of patches) {
        void client
          .requestJson<BankAccount>(
            `/api/v1/bank-accounts/${encodeURIComponent(patch.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                type: patch.type,
                sortOrder: patch.sortOrder,
              }),
            })
          .then((updated) => {
            setAccounts((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
            notifyBankAccountsChanged();
          })
          .catch(() => {
            /* keep optimistic order; next refresh reconciles */
          });
      }
    },
    [accounts, client]);

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
        await client.requestJson<FinancialCategory>(
          "/api/v1/financial-categories",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: input.name,
              kind: input.kind,
              listing: input.listing,
              parentId: input.parentId ?? null,
              sortOrder: Date.now(),
            }),
          });
        await refreshCategories();
      } finally {
        setCategoriesPending(false);
      }
    },
    [client, refreshCategories]);

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
        const updated = await client.requestJson<FinancialCategory>(
          `/api/v1/financial-categories/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
        setCategories((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)));
      } finally {
        setCategoriesPending(false);
      }
    },
    [client]);

  const handleReorderCategories = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = categoryReorderPatches(categories, request);
      if (patches.length === 0) return;
      setCategories((rows) => applyOptimisticCategoryReorder(rows, request));
      for (const patch of patches) {
        const { id, ...body } = patch;
        void client
          .requestJson<FinancialCategory>(
            `/api/v1/financial-categories/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            })
          .then((updated) => {
            setCategories((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [categories, client]);

  const deleteCategory = useCallback(
    async (id: string) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        await client.requestJson(
          `/api/v1/financial-categories/${encodeURIComponent(id)}`,
          { method: "DELETE" });
        setCategories((rows) =>
          rows.filter((row) => row.id !== id && row.parentId !== id));
      } finally {
        setCategoriesPending(false);
      }
    },
    [client]);

  const createGoal = useCallback(
    async (input: FinanceGoalCreateInput) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        await client.requestJson<FinancialGoal>("/api/v1/financial-goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            listing: input.listing,
            sortOrder: Date.now(),
          }),
        });
        await refreshGoals();
      } finally {
        setGoalsPending(false);
      }
    },
    [client, refreshGoals]);

  const updateGoal = useCallback(
    async (id: string, patch: FinanceGoalUpdateInput) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        const updated = await client.requestJson<FinancialGoal>(
          `/api/v1/financial-goals/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
        setGoals((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)));
      } finally {
        setGoalsPending(false);
      }
    },
    [client]);

  const handleReorderGoals = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = goalReorderPatches(goals, request);
      setGoals((rows) => applyOptimisticGoalReorder(rows, request));
      for (const patch of patches) {
        void client
          .requestJson<FinancialGoal>(
            `/api/v1/financial-goals/${encodeURIComponent(patch.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                listing: patch.listing,
                sortOrder: patch.sortOrder,
              }),
            })
          .then((updated) => {
            setGoals((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [client, goals]);

  const deleteGoal = useCallback(
    async (id: string) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        await client.requestJson(
          `/api/v1/financial-goals/${encodeURIComponent(id)}`,
          { method: "DELETE" });
        setGoals((rows) => rows.filter((row) => row.id !== id));
      } finally {
        setGoalsPending(false);
      }
    },
    [client]);

  const createRecurring = useCallback(
    async (input: FinanceRecurringCreateInput) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        const created = await client.requestJson<FinancialRecurring>(
          "/api/v1/financial-recurrings",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: input.name,
              nextDate: input.nextDate,
              categoryId: input.categoryId ?? null,
              amountCents: input.amountCents ?? null,
              archived: input.archived ?? false,
              sortOrder: Date.now(),
            }),
          });
        await refreshRecurrings();
        return { id: created.id };
      } finally {
        setRecurringsPending(false);
      }
    },
    [client, refreshRecurrings]);

  const updateRecurring = useCallback(
    async (id: string, patch: FinanceRecurringUpdateInput) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        const updated = await client.requestJson<FinancialRecurring>(
          `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
        setRecurrings((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)));
      } finally {
        setRecurringsPending(false);
      }
    },
    [client]);

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
        void client
          .requestJson<FinancialRecurring>(
            `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            })
          .then((updated) => {
            setRecurrings((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)));
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [client, recurrings]);

  const deleteRecurring = useCallback(
    async (id: string) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        await client.requestJson(
          `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
          { method: "DELETE" });
        setRecurrings((rows) => rows.filter((row) => row.id !== id));
      } finally {
        setRecurringsPending(false);
      }
    },
    [client]);

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
