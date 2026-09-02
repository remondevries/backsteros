import type { BankAccount } from "@backsteros/contracts";
import {
  DROPDOWN_NONE_VALUE,
  FinanceAccountsView,
  FinanceCashflowView,
  FinanceCategoriesView,
  FinanceDashboardView,
  FinanceGoalsView,
  FinanceInvoicesView,
  FinanceRecurringsView,
  FinanceSectionPlaceholder,
  FinanceTransactionsView,
  RegisterPageTitle,
  getFinanceNavHref,
  getFinanceTransactionsHref,
  type FinanceAccountsChromeState,
  type FinanceCategoriesChromeState,
  type FinanceGoalsChromeState,
  type FinanceRecurringsChromeState,
  type FinanceTransactionsChromeState,
} from "@backsteros/ui";
import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useDesktopApi } from "../lib/api-context";
import {
  useKeepAliveActive,
  useRoutePathActive,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { notifyBankAccountsChanged } from "./finance/finance-page-helpers";
import { FinancePageModals } from "./finance/finance-page-modals";
import { useFinanceCashflow } from "./finance/use-finance-cashflow";
import { useFinanceCoreData } from "./finance/use-finance-core-data";
import { useFinanceMoneybirdInvoices } from "./finance/use-finance-moneybird-invoices";
import { useFinancePageChrome } from "./finance/use-finance-page-chrome";
import { useFinanceSectionData } from "./finance/use-finance-section-data";
import { useFinanceSectionPatchHandlers } from "./finance/use-finance-section-patch-handlers";
import { useFinanceTransactions } from "./finance/use-finance-transactions";
import { navigateToHref } from "../router/navigate-href";

export function FinancePage() {
  const active = useRoutePathActive("/finance");
  if (!active) return null;
  return <FinancePageBody />;
}

function FinancePageBody() {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (
      to: string,
      options?: { replace?: boolean; state?: unknown },
    ) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate]);
  const keepAliveActive = useKeepAliveActive();
  const { pathname } = useShellLocation();
  const { slug, section: sectionParam } = useShellParams() as {
    slug?: string;
    section?: string;
  };
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const { organizations, projects } = workspace;

  const [categoriesChrome, setCategoriesChrome] =
    useState<FinanceCategoriesChromeState | null>(null);
  const [goalsChrome, setGoalsChrome] =
    useState<FinanceGoalsChromeState | null>(null);
  const [recurringsChrome, setRecurringsChrome] =
    useState<FinanceRecurringsChromeState | null>(null);
  const [accountsChrome, setAccountsChrome] =
    useState<FinanceAccountsChromeState | null>(null);
  const [transactionsChrome, setTransactionsChrome] =
    useState<FinanceTransactionsChromeState | null>(null);
  const [pageAccountModal, setPageAccountModal] = useState<
    | { mode: "create"; type?: BankAccount["type"] }
    | { mode: "edit"; account: BankAccount }
    | null
  >(null);
  const [pageAccountModalPending, setPageAccountModalPending] = useState(false);
  const [pageAccountModalError, setPageAccountModalError] = useState<
    string | null
  >(null);

  const {
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
  } = useFinanceCoreData({
    client,
    navigate,
    slug,
    sectionParam,
    routeActive: keepAliveActive,
  });

  const {
    categorySpendById,
    categorySpendMonth,
    localMonthKey,
    refreshCategorySpend,
    handleSpentMonthChange,
    handleDashboardMonthChange,
    selectedCategoryId,
    categoryMetrics,
    setCategoryMetrics,
    categoryMetricsLoading,
    fetchCategoryMetrics,
    assetsDebt,
    assetsDebtLoading,
    assetsDebtRange,
    setAssetsDebtRange,
    reviewTransactions,
    setReviewTransactions,
    reviewTotalCount,
    setReviewTotalCount,
    reviewLoading,
    dashboardSpendLoading,
    dashboardMonthTransactions,
    dashboardPriorMonthTransactions,
    dashboardMonthChartLoading,
    dashboardChartMonth,
    accountBalanceById,
    selectedAccountId,
    setSelectedAccountId,
    accountCashflowYear,
    setAccountCashflowYear,
    accountMetrics,
    setAccountMetrics,
    accountMetricsLoading,
    fetchAccountMetrics,
    monthIncomeCents,
    goalTransactions,
    setGoalTransactions,
    goalTransactionsLoading,
    setSelectedGoalId,
    recurringMetrics,
    setRecurringMetrics,
    recurringMetricsLoading,
    setSelectedRecurringId,
  } = useFinanceSectionData({
    client,
    navId,
    categories,
    categoriesChrome,
    setGoalsChrome,
    setRecurringsChrome,
    setAccountsChrome,
  });

  const {
    moneybirdInvoices,
    moneybirdInvoicesLoading,
    moneybirdInvoicesError,
    moneybirdInvoicesPage,
    setMoneybirdInvoicesPage,
    moneybirdInvoicesTotalPages,
    moneybirdInvoicesHasMore,
    moneybirdInvoicesYear,
    setMoneybirdInvoicesYear,
    moneybirdInvoiceStatusIds,
    setMoneybirdInvoiceStatusIds,
    moneybirdConnected,
    moneybirdRevenueYear,
    moneybirdRevenueMonths,
    moneybirdRevenueLoading,
    selectedMoneybirdInvoiceId,
    setSelectedMoneybirdInvoiceId,
    moneybirdInvoiceDetail,
    moneybirdInvoiceDetailLoading,
    moneybirdInvoiceDetailError,
    loadMoneybirdInvoicesPage,
  } = useFinanceMoneybirdInvoices({ client, navId });

  const {
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
  } = useFinanceCashflow({ client, navId });

  const {
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
    moneybirdAccounts,
    moneybirdAccountsLoading,
    moneybirdSyncPending,
    syncMoneybirdAccount,
  } = useFinanceTransactions({
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
  });

  const {
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
  } = useFinanceSectionPatchHandlers({
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
  });

  const { breadcrumbLabel } = useFinancePageChrome({
    enabled: keepAliveActive,
    navId,
    showTransactions,
    selected,
    categoriesChrome,
    setCategoriesChrome,
    goalsChrome,
    recurringsChrome,
    accountsChrome,
    transactionsChrome,
    setTransactionsChrome,
    moneybirdInvoicesLoading,
    loadMoneybirdInvoicesPage,
    setImportError,
    setLastImportResult,
    setCsvFile,
    setImportAccountId,
    setImportOpen,
    moneybirdSyncPending,
    syncMoneybirdAccount,
  });

  let main: ReactNode = null;
  if (navId === "dashboard") {
    main = (
      <FinanceDashboardView
        reviewTransactions={reviewTransactions}
        reviewTotalCount={reviewTotalCount}
        reviewLoading={reviewLoading}
        categories={categories}
        spentCentsByCategoryId={categorySpendById}
        categorySpendLoading={dashboardSpendLoading}
        monthTransactions={dashboardMonthTransactions}
        priorMonthTransactions={dashboardPriorMonthTransactions}
        monthChartLoading={dashboardMonthChartLoading}
        chartMonth={dashboardChartMonth}
        onChartMonthChange={handleDashboardMonthChange}
        goals={goals}
        goalsLoading={goalsLoading}
        recurrings={recurrings}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        projects={projects}
        assetsDebt={assetsDebt}
        assetsDebtLoading={assetsDebtLoading}
        assetsDebtRange={assetsDebtRange}
        onAssetsDebtRangeChange={setAssetsDebtRange}
        onOpenReview={() => {
          setFilterCategoryIds([DROPDOWN_NONE_VALUE]);
          navigate(getFinanceTransactionsHref());
        }}
        onOpenCategories={() =>
          navigate(getFinanceNavHref("categories"))
        }
        onOpenGoals={() =>
          navigate(getFinanceNavHref("goals"))
        }
        onOpenRecurrings={() =>
          navigate(getFinanceNavHref("recurrings"))
        }
        onOpenAccounts={() =>
          navigate(getFinanceNavHref("accounts"))
        }
        onOpenCashflow={() =>
          navigate(getFinanceNavHref("cashflow"))
        }
        onPatchTransaction={(id, patch) => {
          void handleDashboardTransactionPatch(id, patch);
        }}
        onBulkPatchTransactions={(ids, patch) => {
          void handleDashboardBulkPatch(ids, patch);
        }}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
      />
    );
  } else if (navId === "goals") {
    main = (
      <FinanceGoalsView
        goals={goals}
        pending={goalsPending || goalsLoading}
        error={goalsError}
        selectedGoalTransactions={goalTransactions}
        selectedGoalTransactionsLoading={goalTransactionsLoading}
        monthIncomeCents={monthIncomeCents}
        categories={categories}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        recurrings={recurrings}
        onChromeStateChange={setGoalsChrome}
        onSelectedGoalChange={setSelectedGoalId}
        onPatchTransaction={handleGoalTransactionPatch}
        onBulkPatchTransactions={handleGoalBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreate={createGoal}
        onUpdate={updateGoal}
        onDelete={deleteGoal}
        onReorder={handleReorderGoals}
      />
    );
  } else if (navId === "cashflow") {
    main = (
      <FinanceCashflowView
        cashflow={workspaceCashflow}
        categories={categories}
        loading={workspaceCashflowLoading}
        error={workspaceCashflowError}
        chartMonth={cashflowChartMonth}
        onChartMonthChange={handleCashflowMonthChange}
        spendPanel={spendPanel}
        spendPanelLoading={spendPanelLoading}
        onOpenSpendPanel={handleOpenSpendPanel}
        onCloseSpendPanel={handleCloseSpendPanel}
        onSpendPanelMonthChange={handleSpendPanelMonthChange}
        plannerEntries={plannerEntries}
        plannerLoading={plannerLoading}
        plannerPending={plannerPending}
        plannerError={plannerError}
        onCreatePlannerEntry={createPlannerEntry}
        onUpdatePlannerEntry={updatePlannerEntry}
        onReorderPlannerEntries={reorderPlannerEntries}
        onDeletePlannerEntry={deletePlannerEntry}
      />
    );
  } else if (navId === "invoices") {
    main = (
      <FinanceInvoicesView
        invoices={moneybirdInvoices}
        loading={moneybirdInvoicesLoading}
        error={moneybirdInvoicesError}
        connected={moneybirdConnected}
        page={moneybirdInvoicesPage}
        totalPages={moneybirdInvoicesTotalPages}
        hasMore={moneybirdInvoicesHasMore}
        onPageChange={setMoneybirdInvoicesPage}
        year={moneybirdInvoicesYear}
        latestYear={new Date().getFullYear()}
        onYearChange={(nextYear) => {
          setMoneybirdInvoicesYear(nextYear);
          setMoneybirdInvoicesPage(1);
        }}
        filterStatusIds={moneybirdInvoiceStatusIds}
        onFilterStatusIdsChange={(values) => {
          setMoneybirdInvoiceStatusIds(values);
          setMoneybirdInvoicesPage(1);
        }}
        revenueYear={moneybirdRevenueYear}
        revenueMonths={moneybirdRevenueMonths}
        revenueLoading={moneybirdRevenueLoading}
        organizations={organizations}
        selectedInvoiceId={selectedMoneybirdInvoiceId}
        onSelectedInvoiceChange={setSelectedMoneybirdInvoiceId}
        invoiceDetail={moneybirdInvoiceDetail}
        invoiceDetailLoading={moneybirdInvoiceDetailLoading}
        invoiceDetailError={moneybirdInvoiceDetailError}
        onLinkMoneybirdContact={async (moneybirdContactId, organizationId) => {
          const linked = organizations.filter(
            (org) => org.moneybirdContactId === moneybirdContactId);
          for (const org of linked) {
            if (org.id === organizationId) continue;
            await workspace.patchOrganization(org.id, {
              moneybirdContactId: null,
            });
          }
          if (organizationId) {
            await workspace.patchOrganization(organizationId, {
              moneybirdContactId,
            });
          }
        }}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onOpenSettings={() => navigate("/settings/moneybird")}
      />
    );
  } else if (navId === "investments") {
    main = (
      <FinanceSectionPlaceholder
        title="Investments"
        description="Investments are coming soon."
      />
    );
  } else if (navId === "recurrings") {
    main = (
      <FinanceRecurringsView
        recurrings={recurrings}
        pending={recurringsPending || recurringsLoading}
        error={recurringsError}
        categories={categories}
        metrics={recurringMetrics}
        metricsLoading={recurringMetricsLoading}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        onChromeStateChange={setRecurringsChrome}
        onSelectedRecurringChange={setSelectedRecurringId}
        onPatchTransaction={handleRecurringTransactionPatch}
        onBulkPatchTransactions={handleRecurringBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreate={createRecurring}
        onUpdate={updateRecurring}
        onDelete={deleteRecurring}
        onReorder={handleReorderRecurrings}
      />
    );
  } else if (navId === "accounts") {
    main = (
      <FinanceAccountsView
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        balanceCentsByAccountId={accountBalanceById}
        categories={categories}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        accountMetrics={accountMetrics}
        accountMetricsLoading={accountMetricsLoading}
        cashflowYear={accountCashflowYear}
        latestCashflowYear={new Date().getFullYear()}
        onCashflowYearChange={setAccountCashflowYear}
        onSelectedAccountChange={setSelectedAccountId}
        onChromeStateChange={setAccountsChrome}
        onPatchTransaction={handleAccountTransactionPatch}
        onBulkPatchTransactions={handleAccountBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreateAccount={(type) => {
          setPageAccountModalError(null);
          setPageAccountModal({ mode: "create", type });
        }}
        onDeleteAccount={handleDeleteAccount}
        onUpdateAccount={async (accountId, patch) => {
          await handleUpdateAccount(accountId, patch);
        }}
        onUploadAvatar={async (accountId, file) => {
          const result = await uploadDesktopAvatar(
            client,
            "bank_account",
            accountId,
            file);
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
            notifyBankAccountsChanged();
          }
          return result;
        }}
        onRemoveAvatar={async (accountId) => {
          const result = await removeDesktopAvatar(
            client,
            "bank_account",
            accountId);
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
            notifyBankAccountsChanged();
          }
          return result;
        }}
        onReorder={handleReorderAccounts}
      />
    );
  } else if (navId === "categories") {
    main = (
      <FinanceCategoriesView
        categories={categories}
        spentCentsByCategoryId={categorySpendById}
        spentMonth={categorySpendMonth}
        latestMonth={localMonthKey()}
        pending={categoriesPending}
        error={categoriesError}
        onSpentMonthChange={handleSpentMonthChange}
        categoryMetrics={categoryMetrics}
        categoryMetricsLoading={categoryMetricsLoading}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        onPatchTransaction={handleCategoryTransactionPatch}
        onBulkPatchTransactions={handleCategoryBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onChromeStateChange={setCategoriesChrome}
        onCreate={createCategory}
        onUpdate={updateCategory}
        onDelete={deleteCategory}
        onReorder={handleReorderCategories}
      />
    );
  } else if (showTransactions) {
    main = (
      <FinanceTransactionsView
        account={selected}
        allAccountsSelected={allAccountsSelected}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        onSelectAccount={handleSelectAccount}
        onSelectAllAccounts={handleSelectAllAccounts}
        onRequestImportWithFile={(file) => {
          setImportError(null);
          setLastImportResult(null);
          setCsvFile(file);
          setImportAccountId(selected?.id ?? null);
          setImportOpen(true);
        }}
        onCreateAccount={handleCreateAccount}
        onUploadAccountAvatar={async (accountId, file) => {
          const result = await uploadDesktopAvatar(
            client,
            "bank_account",
            accountId,
            file);
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
          }
          return result;
        }}
        onRemoveAccountAvatar={async (accountId) => {
          const result = await removeDesktopAvatar(
            client,
            "bank_account",
            accountId);
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
          }
          return result;
        }}
        onDeleteAccount={handleDeleteAccount}
        onUpdateAccount={async (accountId, patch) => {
          await handleUpdateAccount(accountId, patch);
        }}
        moneybirdAccounts={moneybirdAccounts}
        moneybirdAccountsLoading={moneybirdAccountsLoading}
        transactions={transactions}
        organizations={organizations}
        projects={projects}
        categories={categories}
        goals={goals}
        recurrings={recurrings}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        amountMinCents={amountMinCents}
        amountMaxCents={amountMaxCents}
        onAmountRangeChange={(min, max) => {
          setAmountMinCents(min);
          setAmountMaxCents(max);
        }}
        filterCategoryIds={filterCategoryIds}
        onFilterCategoryIdsChange={setFilterCategoryIds}
        filterOrganizationId={filterOrganizationId}
        onFilterOrganizationChange={setFilterOrganizationId}
        filterGoalId={filterGoalId}
        onFilterGoalChange={setFilterGoalId}
        filterRecurringId={filterRecurringId}
        onFilterRecurringChange={setFilterRecurringId}
        selectedIds={selectedIds}
        onToggleSelected={handleToggleSelected}
        onSetGroupSelected={handleSetGroupSelected}
        onClearSelection={() => setSelectedIds(new Set())}
        onSelectAllTransactions={handleSelectAllTransactions}
        selectAllPending={selectAllPending}
        onPatchTransaction={(id, patch) => {
          void handlePatchTransaction(id, patch);
        }}
        onBulkPatch={handleBulkPatch}
        onBulkDelete={handleBulkDelete}
        onDeleteTransaction={handleDeleteTransaction}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        hasMore={Boolean(nextCursor)}
        onLoadMore={() => {
          void loadTransactions({ cursor: nextCursor, append: true });
        }}
        onChromeStateChange={setTransactionsChrome}
      />
    );
  }

  return (
    <>
      {keepAliveActive ? (
        <RegisterPageTitle
          active={keepAliveActive}
          href={pathname}
          title={breadcrumbLabel}
        />
      ) : null}
      {main}

      <FinancePageModals
        client={client}
        accounts={accounts}
        selected={selected}
        accountAvatarSrcById={accountAvatarSrcById}
        refreshAccounts={refreshAccounts}
        handleCreateAccount={handleCreateAccount}
        handleUpdateAccount={handleUpdateAccount}
        handleDeleteAccount={handleDeleteAccount}
        importOpen={importOpen}
        setImportOpen={setImportOpen}
        importAccountId={importAccountId}
        setImportAccountId={setImportAccountId}
        imports={imports}
        csvFile={csvFile}
        setCsvFile={setCsvFile}
        csvUploading={csvUploading}
        csvProgress={csvProgress}
        setCsvProgress={setCsvProgress}
        lastImportResult={lastImportResult}
        setLastImportResult={setLastImportResult}
        importError={importError}
        setImportError={setImportError}
        handleImportCsv={handleImportCsv}
        pageAccountModal={pageAccountModal}
        setPageAccountModal={setPageAccountModal}
        pageAccountModalPending={pageAccountModalPending}
        setPageAccountModalPending={setPageAccountModalPending}
        pageAccountModalError={pageAccountModalError}
        setPageAccountModalError={setPageAccountModalError}
      />
    </>
  );
}
