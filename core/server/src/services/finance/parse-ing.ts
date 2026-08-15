import { parseEuroAmountToCents, sha256Hex } from "./fingerprint.js";
import { parseCsv, rowToRecord } from "./csv-parse.js";
import type { NormalizedImportRow, ParseCsvResult } from "./parse-types.js";

const ING_HEADERS = [
  "Date",
  "Name / Description",
  "Account",
  "Counterparty",
  "Code",
  "Debit/credit",
  "Amount (EUR)",
  "Transaction type",
  "Notifications",
  "Resulting balance",
  "Tag",
] as const;

function isIngHeader(headers: string[]): boolean {
  return (
    headers[0] === "Date" &&
    headers[1] === "Name / Description" &&
    headers.some((h) => h === "Amount (EUR)")
  );
}

function parseIngDate(raw: string): string {
  const digits = raw.trim();
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Invalid ING date: ${raw}`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function looksLikeIngCsv(text: string): boolean {
  const head = text.trimStart().slice(0, 200);
  return head.includes("Date") && head.includes("Name / Description");
}

export function parseIngCsv(text: string): ParseCsvResult {
  const parsed = parseCsv(text, ";");
  if (!isIngHeader(parsed.headers)) {
    throw new Error("Not an ING NL CSV export");
  }

  const rows: NormalizedImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const cells = parsed.rows[i]!;
    const raw = rowToRecord(parsed.headers, cells);
    try {
      const bookedOn = parseIngDate(raw.Date ?? "");
      const unsigned = parseEuroAmountToCents(raw["Amount (EUR)"] ?? "");
      const dc = (raw["Debit/credit"] ?? "").trim().toLowerCase();
      const amountCents =
        dc === "debit" ? -Math.abs(unsigned) : Math.abs(unsigned);
      const payee = (raw["Name / Description"] ?? "").trim();
      const counterparty = (raw.Counterparty ?? "").trim() || null;
      const memo = (raw.Notifications ?? "").trim() || null;
      const balanceRaw = (raw["Resulting balance"] ?? "").trim();
      const balanceAfterCents = balanceRaw
        ? parseEuroAmountToCents(balanceRaw)
        : null;
      const account = (raw.Account ?? "").trim() || null;
      const fingerprint = sha256Hex([
        account,
        bookedOn,
        amountCents,
        payee,
        counterparty,
        balanceAfterCents,
        memo,
      ]);
      rows.push({
        bookedOn,
        amountCents,
        currency: "EUR",
        payee,
        counterparty,
        memo,
        balanceAfterCents,
        externalId: null,
        fingerprint,
        sourceCode: (raw.Code ?? "").trim() || null,
        sourceType: (raw["Transaction type"] ?? "").trim() || null,
        sourceAccount: account,
        raw,
      });
    } catch (error) {
      errors.push({
        row: i + 2,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { dialect: "ing_nl", rows, errors };
}

export { ING_HEADERS };
