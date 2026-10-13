/**
 * Minimal dotenv parse/serialize for the ops Secrets key/value editor.
 * Preserves assignment order; drops blank/comment lines on serialize.
 * Quoted values and `\\n` escapes round-trip for PEM-style secrets.
 */

export type DotenvEntry = {
  readonly key: string;
  readonly value: string;
};

export function parseDotenv(content: string): DotenvEntry[] {
  const entries: DotenvEntry[] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const cleaned = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = cleaned.indexOf("=");
    if (eq <= 0) continue;
    const key = cleaned.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    let value = cleaned.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      const quote = value[0]!;
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/gu, "\n")
          .replace(/\\r/gu, "\r")
          .replace(/\\t/gu, "\t")
          .replace(/\\"/gu, '"')
          .replace(/\\\\/gu, "\\");
      }
    }
    entries.push({ key, value });
  }
  return entries;
}

function needsQuotes(value: string): boolean {
  return /[\s#"'$`\\]|\n|\r/u.test(value) || value.length === 0;
}

function escapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\n/gu, "\\n")
    .replace(/\r/gu, "\\r")
    .replace(/\t/gu, "\\t");
}

export function serializeDotenv(entries: readonly DotenvEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    const value = entry.value;
    if (needsQuotes(value)) {
      lines.push(`${key}="${escapeDoubleQuoted(value)}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

export function dotenvEntriesEqual(a: readonly DotenvEntry[], b: readonly DotenvEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => entry.key === b[index]?.key && entry.value === b[index]?.value);
}
