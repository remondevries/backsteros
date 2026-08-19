import type { MobileFinanceSectionId } from "./finance-sections";
import { MOBILE_FINANCE_SECTIONS } from "./finance-sections";

/**
 * Desktop-parity F-leader destinations while in Finance (F then letter).
 * Investments use V — I is invoices. Letters match
 * `DEFAULT_FINANCE_GO_NAVIGATION_ITEMS` in `@backsteros/ui`.
 */
export type FinanceGoNavigationItem = {
  id: MobileFinanceSectionId;
  letter: string;
  label: string;
  href: string;
};

const LETTER_BY_SECTION: Record<MobileFinanceSectionId, string> = {
  dashboard: "d",
  transactions: "t",
  invoices: "i",
  goals: "g",
  cashflow: "w",
  accounts: "a",
  investments: "v",
  categories: "c",
  recurrings: "r",
};

export const FINANCE_GO_NAVIGATION_ITEMS: readonly FinanceGoNavigationItem[] =
  MOBILE_FINANCE_SECTIONS.map((section) => ({
    id: section.id,
    letter: LETTER_BY_SECTION[section.id],
    label: section.label,
    href: section.href,
  }));

export function findFinanceGoItemByLetter(
  letter: string,
  items: readonly FinanceGoNavigationItem[] = FINANCE_GO_NAVIGATION_ITEMS,
): FinanceGoNavigationItem | undefined {
  const normalized = letter.toLowerCase();
  return items.find((item) => item.letter === normalized);
}
