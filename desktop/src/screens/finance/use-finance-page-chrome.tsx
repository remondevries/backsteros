import type { BankAccount } from "@backsteros/contracts";
import {
  AccountActionsMenu,
  CategoryActionsMenu,
  GoalActionsMenu,
  ProjectsSidePanelIcon,
  FinanceSyncIcon,
  RecurringActionsMenu,
  TransactionActionsMenu,
  getFinanceDashboardHref,
  getFinanceNavHref,
  getFinanceTransactionsHref,
  type FinanceAccountsChromeState,
  type FinanceCategoriesChromeState,
  type FinanceGoalsChromeState,
  type FinanceNavId,
  type FinanceRecurringsChromeState,
  type FinanceTransactionsChromeState,
} from "@backsteros/ui";
import {
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import { useDesktopSectionBreadcrumb } from "../../lib/use-desktop-breadcrumb";
import type { useFinanceMoneybirdInvoices } from "./use-finance-moneybird-invoices";
import type { useFinanceTransactions } from "./use-finance-transactions";

type FinanceMoneybirdInvoicesData = ReturnType<
  typeof useFinanceMoneybirdInvoices
>;
type FinanceTransactionsData = ReturnType<typeof useFinanceTransactions>;

export function useFinancePageChrome({
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
  enabled = true,
}: Pick<
  FinanceMoneybirdInvoicesData,
  "moneybirdInvoicesLoading" | "loadMoneybirdInvoicesPage"
> &
  Pick<
    FinanceTransactionsData,
    | "setImportError"
    | "setLastImportResult"
    | "setCsvFile"
    | "setImportAccountId"
    | "setImportOpen"
    | "moneybirdSyncPending"
    | "syncMoneybirdAccount"
  > & {
    navId: FinanceNavId | null;
    showTransactions: boolean;
    selected: BankAccount | null;
    categoriesChrome: FinanceCategoriesChromeState | null;
    setCategoriesChrome: Dispatch<
      SetStateAction<FinanceCategoriesChromeState | null>
    >;
    goalsChrome: FinanceGoalsChromeState | null;
    recurringsChrome: FinanceRecurringsChromeState | null;
    accountsChrome: FinanceAccountsChromeState | null;
    transactionsChrome: FinanceTransactionsChromeState | null;
    setTransactionsChrome: Dispatch<
      SetStateAction<FinanceTransactionsChromeState | null>
    >;
    enabled?: boolean;
  }) {
  const chromeActions = useMemo(() => {
    if (navId === "invoices") {
      return (
        <div className="finance-chrome-actions">
          <button
            type="button"
            className="finance-chrome-actions__icon-button"
            aria-label="Refresh invoices"
            title="Refresh invoices"
            disabled={moneybirdInvoicesLoading}
            onClick={() => {
              void loadMoneybirdInvoicesPage();
            }}
          >
            <FinanceSyncIcon
              size={14}
              className={
                moneybirdInvoicesLoading
                  ? "finance-chrome-actions__sync-icon is-spinning"
                  : "finance-chrome-actions__sync-icon"
              }
            />
          </button>
        </div>
      );
    }
    if (!showTransactions) return null;
    if (selected?.moneybirdFinancialAccountId) {
      return (
        <div className="finance-chrome-actions">
          <button
            type="button"
            className="finance-chrome-actions__button"
            disabled={moneybirdSyncPending}
            aria-label="Sync Moneybird transactions"
            title="Sync Moneybird transactions"
            onClick={() => {
              void syncMoneybirdAccount({ force: true });
            }}
          >
            <FinanceSyncIcon
              className={
                moneybirdSyncPending
                  ? "finance-chrome-actions__sync-icon is-spinning"
                  : "finance-chrome-actions__sync-icon"
              }
            />
          </button>
        </div>
      );
    }
    return (
      <div className="finance-chrome-actions">
        <button
          type="button"
          className="finance-chrome-actions__button"
          onClick={() => {
            setImportError(null);
            setLastImportResult(null);
            setCsvFile(null);
            setImportAccountId(selected?.id ?? null);
            setImportOpen(true);
          }}
        >
          Import
        </button>
      </div>
    );
  }, [
    loadMoneybirdInvoicesPage,
    moneybirdInvoicesLoading,
    moneybirdSyncPending,
    navId,
    selected?.id,
    selected?.moneybirdFinancialAccountId,
    showTransactions,
    syncMoneybirdAccount,
  ]);

  const breadcrumbLabel =
    selected?.name ??
    (navId === "transactions"
      ? "Transactions"
      : navId === "accounts"
        ? "Accounts"
        : navId === "categories"
          ? "Categories"
          : navId === "dashboard"
            ? "Dashboard"
            : navId === "goals"
              ? "Goals"
              : navId === "cashflow"
                ? "Cash Flow"
                : navId === "invoices"
                  ? "Invoices"
                : navId === "investments"
                  ? "Investments"
                  : navId === "recurrings"
                    ? "Recurrings"
                    : "Finance");

  const categoriesTrailingPanel = useMemo(() => {
    if (navId !== "categories" || !categoriesChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <CategoryActionsMenu
          category={categoriesChrome.category}
          currentListing={categoriesChrome.currentListing}
          currentKind={categoriesChrome.currentKind}
          currentParentId={categoriesChrome.currentParentId}
          canChangeGroup={categoriesChrome.canChangeGroup}
          groupOptions={categoriesChrome.groupOptions}
          onSetListing={categoriesChrome.onSetListing}
          onSetKind={categoriesChrome.onSetKind}
          onSetGroup={categoriesChrome.onSetGroup}
          onDelete={categoriesChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            categoriesChrome.detailCollapsed
              ? "Show category details"
              : "Hide category details"
          }
          aria-label={
            categoriesChrome.detailCollapsed
              ? "Show category details"
              : "Hide category details"
          }
          aria-pressed={categoriesChrome.detailCollapsed}
          onClick={categoriesChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={categoriesChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [categoriesChrome, navId]);

  const goalsTrailingPanel = useMemo(() => {
    if (navId !== "goals" || !goalsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <GoalActionsMenu
          currentListing={goalsChrome.currentListing}
          onSetListing={goalsChrome.onSetListing}
          onDelete={goalsChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            goalsChrome.detailCollapsed
              ? "Show goal details"
              : "Hide goal details"
          }
          aria-label={
            goalsChrome.detailCollapsed
              ? "Show goal details"
              : "Hide goal details"
          }
          aria-pressed={goalsChrome.detailCollapsed}
          onClick={goalsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={goalsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [goalsChrome, navId]);

  const recurringsTrailingPanel = useMemo(() => {
    if (navId !== "recurrings" || !recurringsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <RecurringActionsMenu
          recurring={recurringsChrome.recurring}
          onArchive={recurringsChrome.onArchive}
          onDelete={recurringsChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            recurringsChrome.detailCollapsed
              ? "Show recurring details"
              : "Hide recurring details"
          }
          aria-label={
            recurringsChrome.detailCollapsed
              ? "Show recurring details"
              : "Hide recurring details"
          }
          aria-pressed={recurringsChrome.detailCollapsed}
          onClick={recurringsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={recurringsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [navId, recurringsChrome]);

  const accountsTrailingPanel = useMemo(() => {
    if (navId !== "accounts" || !accountsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        {accountsChrome.account ? (
          <AccountActionsMenu
            account={accountsChrome.account}
            onDelete={accountsChrome.onDelete}
          />
        ) : null}
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            accountsChrome.detailCollapsed
              ? "Show account details"
              : "Hide account details"
          }
          aria-label={
            accountsChrome.detailCollapsed
              ? "Show account details"
              : "Hide account details"
          }
          aria-pressed={accountsChrome.detailCollapsed}
          onClick={accountsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={accountsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [accountsChrome, navId]);

  const transactionsTrailingPanel = useMemo(() => {
    if (!showTransactions || !transactionsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <TransactionActionsMenu
          transaction={transactionsChrome.transaction}
          onDelete={transactionsChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            transactionsChrome.detailCollapsed
              ? "Show transaction details"
              : "Hide transaction details"
          }
          aria-label={
            transactionsChrome.detailCollapsed
              ? "Show transaction details"
              : "Hide transaction details"
          }
          aria-pressed={transactionsChrome.detailCollapsed}
          onClick={transactionsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={transactionsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [showTransactions, transactionsChrome]);

  const breadcrumbItems = useMemo(() => {
    const items: { label: string; href?: string }[] = [
      { label: "Finance", href: getFinanceDashboardHref() },
    ];
    if (navId === "categories" && categoriesChrome?.category) {
      items.push({
        label: "Categories",
        href: getFinanceNavHref("categories"),
      });
      items.push({ label: categoriesChrome.category.name });
    } else if (navId === "goals" && goalsChrome?.goal) {
      items.push({ label: "Goals", href: getFinanceNavHref("goals") });
      items.push({ label: goalsChrome.goal.name });
    } else if (navId === "recurrings" && recurringsChrome?.recurring) {
      items.push({
        label: "Recurrings",
        href: getFinanceNavHref("recurrings"),
      });
      items.push({ label: recurringsChrome.recurring.name });
    } else if (navId === "accounts" && accountsChrome?.account) {
      items.push({ label: "Accounts", href: getFinanceNavHref("accounts") });
      items.push({ label: accountsChrome.account.name });
    } else if (showTransactions && transactionsChrome?.transaction) {
      items.push({
        label: "Transactions",
        href: getFinanceTransactionsHref(),
      });
      const tx = transactionsChrome.transaction;
      const label =
        tx.displayName?.trim() ||
        tx.payee.trim() ||
        tx.memo?.trim() ||
        tx.counterparty?.trim() ||
        "Untitled transaction";
      items.push({
        label: label.length > 48 ? `${label.slice(0, 45)}…` : label,
      });
    } else {
      items.push({ label: breadcrumbLabel });
    }
    return items;
  }, [
    accountsChrome?.account,
    breadcrumbLabel,
    categoriesChrome?.category,
    goalsChrome?.goal,
    navId,
    recurringsChrome?.recurring,
    showTransactions,
    transactionsChrome?.transaction,
  ]);

  const detailCollapsedForChrome =
    navId === "categories"
      ? categoriesChrome?.detailCollapsed
      : navId === "goals"
        ? goalsChrome?.detailCollapsed
        : navId === "recurrings"
          ? recurringsChrome?.detailCollapsed
          : navId === "accounts"
            ? accountsChrome?.detailCollapsed
            : showTransactions
              ? transactionsChrome?.detailCollapsed
              : false;

  const detailResizedForChrome =
    navId === "categories"
      ? categoriesChrome?.detailResized
      : navId === "goals"
        ? goalsChrome?.detailResized
        : navId === "recurrings"
          ? recurringsChrome?.detailResized
          : navId === "accounts"
            ? accountsChrome?.detailResized
            : showTransactions
              ? transactionsChrome?.detailResized
              : false;

  const chromeClassName =
    [
      detailCollapsedForChrome ? "is-finance-detail-collapsed" : null,
      detailResizedForChrome && !detailCollapsedForChrome
        ? "is-detail-resized"
        : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  useDesktopSectionBreadcrumb(breadcrumbItems, {
    actions: chromeActions,
    trailingPanel:
      navId === "accounts"
        ? accountsTrailingPanel
        : navId === "categories"
          ? categoriesTrailingPanel
          : navId === "goals"
            ? goalsTrailingPanel
            : navId === "recurrings"
              ? recurringsTrailingPanel
              : showTransactions
                ? transactionsTrailingPanel
                : null,
    className: chromeClassName,
    enabled,
  });

  useEffect(() => {
    if (navId === "categories") return;
    setCategoriesChrome(null);
  }, [navId]);

  useEffect(() => {
    if (showTransactions) return;
    setTransactionsChrome(null);
  }, [showTransactions]);

  return { breadcrumbLabel };
}
