/**
 * Mobile Finance sections — mirrors desktop `FINANCE_NAV_ITEMS`
 * (`@backsteros/ui` finance-nav). Investments is a coming-soon placeholder.
 */
export const MOBILE_FINANCE_SECTION_IDS = [
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

export type MobileFinanceSectionId =
  (typeof MOBILE_FINANCE_SECTION_IDS)[number];

export type MobileFinanceSection = {
  id: MobileFinanceSectionId;
  label: string;
  /** Expo Router path within the signed-in app. */
  href: string;
};

export const MOBILE_FINANCE_SECTIONS: readonly MobileFinanceSection[] = [
  { id: "dashboard", label: "Dashboard", href: "/finance" },
  { id: "transactions", label: "Transactions", href: "/finance/transactions" },
  { id: "invoices", label: "Invoices", href: "/finance/invoices" },
  { id: "goals", label: "Goals", href: "/finance/goals" },
  { id: "cashflow", label: "Cash Flow", href: "/finance/cashflow" },
  { id: "accounts", label: "Accounts", href: "/finance/accounts" },
  { id: "investments", label: "Investments", href: "/finance/investments" },
  { id: "categories", label: "Categories", href: "/finance/categories" },
  { id: "recurrings", label: "Recurrings", href: "/finance/recurrings" },
] as const;

export function financeSectionForPathname(
  pathname: string,
): MobileFinanceSectionId | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "finance") return null;
  const second = segments[1] ?? null;
  if (!second) return "dashboard";
  if (second === "transactions" || second === "transaction") return "transactions";
  if (second === "invoices" || second === "invoice") return "invoices";
  if (second === "goals" || second === "goal") return "goals";
  if (second === "cashflow") return "cashflow";
  if (second === "accounts" || second === "account") return "accounts";
  if (second === "investments") return "investments";
  if (second === "categories" || second === "category") return "categories";
  if (second === "recurrings" || second === "recurring") return "recurrings";
  return null;
}
