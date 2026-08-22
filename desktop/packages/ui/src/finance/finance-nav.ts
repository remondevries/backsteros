import type { BankAccount, BankAccountType } from "@backsteros/contracts";

import { isFinanceSectionPath } from "../navigation/entity-routes.js";

export const FINANCE_NAV_IDS = [
  "dashboard",
  "transactions",
  "invoices",
  "goals",
  "cashflow",
  "accounts",
  "investments",
  "categories",
  "recurrings",
] as const;

export type FinanceNavId = (typeof FINANCE_NAV_IDS)[number];

export type FinanceNavItem = {
  id: FinanceNavId;
  label: string;
  href: string;
};

export const FINANCE_NAV_ITEMS: readonly FinanceNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/finance/dashboard" },
  { id: "transactions", label: "Transactions", href: "/finance/transactions" },
  { id: "invoices", label: "Invoices", href: "/finance/invoices" },
  { id: "goals", label: "Goals", href: "/finance/goals" },
  { id: "cashflow", label: "Cash Flow", href: "/finance/cashflow" },
  { id: "accounts", label: "Accounts", href: "/finance/accounts" },
  { id: "investments", label: "Investments", href: "/finance/investments" },
  { id: "categories", label: "Categories", href: "/finance/categories" },
  { id: "recurrings", label: "Recurrings", href: "/finance/recurrings" },
] as const;

export const FINANCE_ACCOUNT_GROUP_IDS = [
  "credit_cards",
  "savings",
  "investments",
  "bank_accounts",
] as const;

export type FinanceAccountGroupId = (typeof FINANCE_ACCOUNT_GROUP_IDS)[number];

export type FinanceAccountGroup = {
  id: FinanceAccountGroupId;
  label: string;
  accounts: BankAccount[];
};

export const BANK_ACCOUNT_TYPE_OPTIONS: readonly {
  value: BankAccountType;
  label: string;
}[] = [
  { value: "bank_account", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
] as const;

const FINANCE_NAV_ID_SET = new Set<string>(FINANCE_NAV_IDS);

export function isFinanceNavId(value: string | null | undefined): value is FinanceNavId {
  return Boolean(value && FINANCE_NAV_ID_SET.has(value));
}

export function getFinanceNavHref(id: FinanceNavId): string {
  return `/finance/${id}`;
}

/** Default finance landing — dashboard overview. */
export function getFinanceDashboardHref(): string {
  return getFinanceNavHref("dashboard");
}

/** All-account transactions list. */
export function getFinanceTransactionsHref(): string {
  return getFinanceNavHref("transactions");
}

export function getFinanceAccountHref(accountSlug: string): string {
  return `/finance/${encodeURIComponent(accountSlug)}`;
}

/**
 * F-leader destinations while already in Finance (F then letter).
 * Investments use V — I is invoices.
 */
export type FinanceGoNavigationItem = {
  id: FinanceNavId;
  letter: string;
  hint: string;
  label: string;
  href: string;
};

export const DEFAULT_FINANCE_GO_NAVIGATION_ITEMS: readonly FinanceGoNavigationItem[] =
  [
    {
      id: "dashboard",
      letter: "d",
      hint: "F D",
      label: "Dashboard",
      href: getFinanceNavHref("dashboard"),
    },
    {
      id: "transactions",
      letter: "t",
      hint: "F T",
      label: "Transactions",
      href: getFinanceNavHref("transactions"),
    },
    {
      id: "invoices",
      letter: "i",
      hint: "F I",
      label: "Invoices",
      href: getFinanceNavHref("invoices"),
    },
    {
      id: "goals",
      letter: "g",
      hint: "F G",
      label: "Goals",
      href: getFinanceNavHref("goals"),
    },
    {
      id: "cashflow",
      letter: "w",
      hint: "F W",
      label: "Cash Flow",
      href: getFinanceNavHref("cashflow"),
    },
    {
      id: "accounts",
      letter: "a",
      hint: "F A",
      label: "Accounts",
      href: getFinanceNavHref("accounts"),
    },
    {
      id: "investments",
      letter: "v",
      hint: "F V",
      label: "Investments",
      href: getFinanceNavHref("investments"),
    },
    {
      id: "categories",
      letter: "c",
      hint: "F C",
      label: "Categories",
      href: getFinanceNavHref("categories"),
    },
    {
      id: "recurrings",
      letter: "r",
      hint: "F R",
      label: "Recurrings",
      href: getFinanceNavHref("recurrings"),
    },
  ] as const;

export const FINANCE_GO_LETTER_HINT = DEFAULT_FINANCE_GO_NAVIGATION_ITEMS.map(
  (item) => item.letter,
).join(" ");

export function financeGoNavigationItemSearchValue(
  item: FinanceGoNavigationItem,
): string {
  return `${item.label} ${item.letter} ${item.href}`;
}

export function getSelectedFinanceNavIdFromPathname(
  pathname: string,
): FinanceNavId | null {
  if (!isFinanceSectionPath(pathname)) return null;
  const segment = pathname.split("/").filter(Boolean)[1] ?? null;
  return isFinanceNavId(segment) ? segment : null;
}

export function isFinanceAccountPath(pathname: string): boolean {
  if (!isFinanceSectionPath(pathname)) return false;
  const segment = pathname.split("/").filter(Boolean)[1] ?? null;
  return Boolean(segment && !isFinanceNavId(segment));
}

export function bankAccountTypeLabel(type: BankAccountType): string {
  return (
    BANK_ACCOUNT_TYPE_OPTIONS.find((entry) => entry.value === type)?.label ??
    "Bank account"
  );
}

export function financeAccountGroupIdForType(
  type: BankAccountType,
): FinanceAccountGroupId {
  switch (type) {
    case "credit_card":
      return "credit_cards";
    case "savings":
      return "savings";
    case "investment":
      return "investments";
    case "bank_account":
    default:
      return "bank_accounts";
  }
}

export function bankAccountTypeForFinanceAccountGroupId(
  groupId: FinanceAccountGroupId,
): BankAccountType {
  switch (groupId) {
    case "credit_cards":
      return "credit_card";
    case "savings":
      return "savings";
    case "investments":
      return "investment";
    case "bank_accounts":
    default:
      return "bank_account";
  }
}

/**
 * Group accounts for the finance side panel by account type.
 */
export function groupBankAccountsForFinanceNav(
  accounts: BankAccount[],
): FinanceAccountGroup[] {
  const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  const buckets: Record<FinanceAccountGroupId, BankAccount[]> = {
    credit_cards: [],
    savings: [],
    investments: [],
    bank_accounts: [],
  };

  for (const account of sorted) {
    buckets[financeAccountGroupIdForType(account.type)].push(account);
  }

  return [
    { id: "credit_cards", label: "Credit cards", accounts: buckets.credit_cards },
    { id: "savings", label: "Savings", accounts: buckets.savings },
    { id: "investments", label: "Investments", accounts: buckets.investments },
    {
      id: "bank_accounts",
      label: "Bank accounts",
      accounts: buckets.bank_accounts,
    },
  ];
}
