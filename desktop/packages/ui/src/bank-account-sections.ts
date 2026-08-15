export const BANK_ACCOUNT_SECTION_IDS = ["transactions", "imports"] as const;

export type BankAccountSectionId = (typeof BANK_ACCOUNT_SECTION_IDS)[number];

export type BankAccountSectionConfig = {
  id: BankAccountSectionId;
  label: string;
};

export const BANK_ACCOUNT_SECTIONS: readonly BankAccountSectionConfig[] = [
  { id: "transactions", label: "Transactions" },
  { id: "imports", label: "Imports" },
];

export function isBankAccountSectionId(
  value: string,
): value is BankAccountSectionId {
  return (BANK_ACCOUNT_SECTION_IDS as readonly string[]).includes(value);
}

export function parseBankAccountSectionId(
  value: string | null | undefined,
): BankAccountSectionId {
  if (!value || value === "transactions") return "transactions";
  return isBankAccountSectionId(value) ? value : "transactions";
}

export function getBankAccountSectionHref(
  accountSlug: string,
  section: BankAccountSectionId = "transactions",
): string {
  const base = `/finance/${encodeURIComponent(accountSlug)}`;
  return section === "transactions" ? base : `${base}/${section}`;
}

export function getFinanceHref(accountSlug?: string): string {
  if (!accountSlug) return "/finance/dashboard";
  return `/finance/${encodeURIComponent(accountSlug)}`;
}
