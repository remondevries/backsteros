/**
 * Public Lemo-Design contact details for invoice letterheads (desktop, mobile,
 * Moneybird identity overrides). Keep in sync with the client portal.
 */

export const LEMO_COMPANY_NAME = "Lemo-Design";

/** Default finance inbox (English / .com). Prefer {@link getLemoFinanceEmail}. */
export const LEMO_FINANCE_EMAIL = "financials@lemo-design.com";

/** IBAN — invoice letterhead (overrides Moneybird identity bank). */
export const LEMO_BANK_ACCOUNT = "NL97ADYB1000071116";

/** Locale-specific finance inbox: NL → financieel@.nl, EN → financials@.com. */
export function getLemoFinanceEmail(
  language: string | null | undefined,
): string {
  return language?.trim().toLowerCase() === "nl"
    ? "financieel@lemo-design.nl"
    : LEMO_FINANCE_EMAIL;
}

/**
 * Force portal-owned sender bank + finance inbox on a Moneybird identity party
 * (invoice letterhead). Language comes from the invoice (`nl` / `en`).
 */
export function withLemoInvoiceSenderOverrides<
  T extends { bankAccountNumber: string | null; email: string | null },
>(party: T, language?: string | null): T {
  return {
    ...party,
    bankAccountNumber: LEMO_BANK_ACCOUNT,
    email: getLemoFinanceEmail(language),
  };
}
