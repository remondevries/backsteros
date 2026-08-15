import { parseEuroAmountToCents, sha256Hex } from "./fingerprint.js";
import { parseCsv, rowToRecord } from "./csv-parse.js";
import type { NormalizedImportRow, ParseCsvResult } from "./parse-types.js";

function isAmexHeader(headers: string[]): boolean {
  return (
    headers[0] === "Datum" &&
    headers.includes("Omschrijving") &&
    headers.includes("Bedrag") &&
    headers.includes("Referentie")
  );
}

/** AMEX NL exports use US MM/DD/YYYY despite Dutch headers. */
function parseAmexDate(raw: string): string {
  const trimmed = raw.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) throw new Error(`Invalid AMEX date: ${raw}`);
  const mm = match[1]!.padStart(2, "0");
  const dd = match[2]!.padStart(2, "0");
  const yyyy = match[3]!;
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeReferentie(raw: string): string {
  return raw.trim().replace(/^'+/, "").replace(/'+$/, "");
}

export function looksLikeAmexCsv(text: string): boolean {
  const head = text.trimStart().slice(0, 200);
  return head.startsWith("Datum") && head.includes("Omschrijving");
}

export function parseAmexCsv(text: string): ParseCsvResult {
  const parsed = parseCsv(text, ",");
  if (!isAmexHeader(parsed.headers)) {
    throw new Error("Not an AMEX NL CSV export");
  }

  const rows: NormalizedImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const cells = parsed.rows[i]!;
    const raw = rowToRecord(parsed.headers, cells);
    try {
      const bookedOn = parseAmexDate(raw.Datum ?? "");
      const amountCents = parseEuroAmountToCents(raw.Bedrag ?? "");
      const payee = (raw.Omschrijving ?? "").trim();
      const memo = (raw["Aanvullende informatie"] ?? "").trim() || null;
      const externalId = normalizeReferentie(raw.Referentie ?? "");
      if (!externalId) throw new Error("Missing Referentie");
      const rekening = (raw["Rekening #"] ?? "").trim() || null;
      const fingerprint = sha256Hex([
        "amex",
        externalId,
        bookedOn,
        amountCents,
        payee,
      ]);
      rows.push({
        bookedOn,
        amountCents,
        currency: "EUR",
        payee,
        counterparty: null,
        memo,
        balanceAfterCents: null,
        externalId,
        fingerprint,
        sourceCode: null,
        sourceType: "AMEX",
        sourceAccount: rekening,
        raw,
      });
    } catch (error) {
      errors.push({
        row: i + 2,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { dialect: "amex_nl", rows, errors };
}
