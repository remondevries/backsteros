/**
 * Group bank accounts by type for the accounts screen and iPad nav pane.
 * Mirrors desktop `groupBankAccountsForFinanceNav` (`@backsteros/ui`
 * finance-nav) — reimplemented here because mobile shares contracts only.
 */
export const BANK_ACCOUNT_GROUP_IDS = [
  "credit_cards",
  "savings",
  "investments",
  "bank_accounts",
] as const;

export type BankAccountGroupId = (typeof BANK_ACCOUNT_GROUP_IDS)[number];

export type GroupableBankAccount = {
  id: string;
  name: string;
  type: string;
};

export type BankAccountGroup<T extends GroupableBankAccount> = {
  id: BankAccountGroupId;
  label: string;
  accounts: T[];
};

export const BANK_ACCOUNT_GROUP_LABELS: Record<BankAccountGroupId, string> = {
  credit_cards: "Credit cards",
  savings: "Savings",
  investments: "Investments",
  bank_accounts: "Bank accounts",
};

export function bankAccountGroupIdForType(type: string): BankAccountGroupId {
  switch (type) {
    case "credit_card":
      return "credit_cards";
    case "savings":
      return "savings";
    case "investment":
      return "investments";
    default:
      return "bank_accounts";
  }
}

export function bankAccountTypeLabel(type: string): string {
  switch (type) {
    case "credit_card":
      return "Credit card";
    case "savings":
      return "Savings";
    case "investment":
      return "Investment";
    default:
      return "Bank account";
  }
}

/** Groups sorted in the desktop order; empty groups are dropped. */
export function groupBankAccounts<T extends GroupableBankAccount>(
  accounts: readonly T[],
): BankAccountGroup<T>[] {
  const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  const buckets: Record<BankAccountGroupId, T[]> = {
    credit_cards: [],
    savings: [],
    investments: [],
    bank_accounts: [],
  };
  for (const account of sorted) {
    buckets[bankAccountGroupIdForType(account.type)].push(account);
  }
  return BANK_ACCOUNT_GROUP_IDS.map((id) => ({
    id,
    label: BANK_ACCOUNT_GROUP_LABELS[id],
    accounts: buckets[id],
  })).filter((group) => group.accounts.length > 0);
}
