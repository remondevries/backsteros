/**
 * Tiny RFC 4180-ish CSV parser tuned for bank exports.
 * Supports `;` / `,` / `\t`, quoted fields, and embedded newlines.
 */

export type CsvSeparator = "," | ";" | "\t";

export type ParsedCsv = {
  separator: CsvSeparator;
  headers: string[];
  rows: string[][];
};

export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

export function detectSeparator(text: string): CsvSeparator {
  const head = stripBom(text).split(/\r\n|\n|\r/, 1)[0] ?? "";
  let inQuote = false;
  const counts: Record<CsvSeparator, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < head.length; i++) {
    const ch = head[i]!;
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (ch === "," || ch === ";" || ch === "\t")) counts[ch]++;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

export function parseCsv(input: string, separator?: CsvSeparator): ParsedCsv {
  const text = stripBom(input);
  const sep = separator ?? detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  let line = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field.length === 0) inQuote = true;
      else field += ch;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line++;
      continue;
    }
    field += ch;
  }

  if (inQuote) {
    throw new Error(`Unterminated quoted field at line ${line}`);
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === "") rows.pop();
    else break;
  }

  if (rows.length === 0) {
    return { separator: sep, headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = rows;
  return {
    separator: sep,
    headers: (headerRow ?? []).map((h) => h.trim()),
    rows: dataRows,
  };
}

export function rowToRecord(
  headers: string[],
  cells: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i] ?? `col_${i}`;
    out[key] = cells[i] ?? "";
  }
  return out;
}
