import type { FinancialImportDialect } from "@backsteros/contracts";

export type NormalizedImportRow = {
  bookedOn: string;
  amountCents: number;
  currency: string;
  payee: string;
  counterparty: string | null;
  memo: string | null;
  balanceAfterCents: number | null;
  externalId: string | null;
  fingerprint: string;
  sourceCode: string | null;
  sourceType: string | null;
  /** CSV Account / IBAN / Rekening # when present — used for account mismatch checks. */
  sourceAccount: string | null;
  raw: Record<string, string>;
};

export type ParseCsvResult = {
  dialect: FinancialImportDialect;
  rows: NormalizedImportRow[];
  errors: Array<{ row: number; message: string }>;
};
