/**
 * Build magnitude pie slices from account balances.
 * Negative (debt) balances are excluded from the pie; signed total is separate.
 */

export type AccountBalancePieInput = {
  id: string;
  label: string;
  balanceCents: number;
  color: string;
};

export type AccountBalancePieSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

export function buildAccountBalancePie(input: {
  accounts: readonly AccountBalancePieInput[];
}): {
  slices: AccountBalancePieSlice[];
  totalCents: number;
} {
  const totalCents = input.accounts.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const slices = input.accounts
    .filter((account) => account.balanceCents > 0)
    .map((account) => ({
      id: account.id,
      label: account.label,
      value: account.balanceCents,
      color: account.color,
    }));
  return { slices, totalCents };
}
