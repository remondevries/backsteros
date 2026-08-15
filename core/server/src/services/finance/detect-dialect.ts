import { parseAmexCsv, looksLikeAmexCsv } from "./parse-amex.js";
import { parseIngCsv, looksLikeIngCsv } from "./parse-ing.js";
import type { ParseCsvResult } from "./parse-types.js";

export function parseBankCsv(text: string): ParseCsvResult {
  if (looksLikeIngCsv(text)) return parseIngCsv(text);
  if (looksLikeAmexCsv(text)) return parseAmexCsv(text);
  throw new Error(
    "Unrecognized CSV dialect. Supported: ING NL and AMEX NL exports.",
  );
}
