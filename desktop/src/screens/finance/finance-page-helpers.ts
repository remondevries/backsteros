import type {
  BankAccountCashflowMonth,
  FinancialRecurring,
} from "@backsteros/contracts";
import {
  recurringDateGroup,
  type RecurringReorderGroup,
} from "@backsteros/ui";

const BANK_ACCOUNTS_CHANGED_EVENT = "backsteros:bank-accounts-changed";

export function notifyBankAccountsChanged() {
  window.dispatchEvent(new Event(BANK_ACCOUNTS_CHANGED_EVENT));
}

export function accountSlug(account: { key?: string | null; id: string }) {
  return account.key ?? account.id;
}

function financeLocalMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Moneybird billed income + combined bank-account expenses for the invoices chart. */
export function mergeInvoiceRevenueWithAccountExpenses(
  revenueMonths: BankAccountCashflowMonth[],
  accountMonths: BankAccountCashflowMonth[] | undefined,
): BankAccountCashflowMonth[] {
  const expenseByMonth = new Map(
    (accountMonths ?? []).map((row) => [row.month, row.expenseCents]),
  );
  return revenueMonths.map((row) => ({
    month: row.month,
    incomeCents: row.incomeCents,
    expenseCents: expenseByMonth.get(row.month) ?? 0,
  }));
}

function seedRecurringNextDateForGroup(group: RecurringReorderGroup): string {
  const now = new Date();
  if (group === "this_month") {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function resolveRecurringReorderGroup(
  row: FinancialRecurring,
): RecurringReorderGroup {
  return recurringDateGroup(
    row.nextDate,
    financeLocalMonthKey(),
    new Date(),
    Boolean(row.archived),
  );
}

export function applyRecurringReorderGroup(
  row: FinancialRecurring,
  group: RecurringReorderGroup,
): FinancialRecurring {
  if (group === "archived") return { ...row, archived: true };
  if (resolveRecurringReorderGroup(row) === group) {
    return { ...row, archived: false };
  }
  return {
    ...row,
    archived: false,
    nextDate: seedRecurringNextDateForGroup(group),
  };
}
