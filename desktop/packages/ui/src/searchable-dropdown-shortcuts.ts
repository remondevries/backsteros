/** Numeric shortcuts: 1–9, then 0 for the tenth option. */
export function searchableDropdownShortcut(index: number): string | undefined {
  if (index < 0) return undefined;
  if (index < 9) return String(index + 1);
  if (index === 9) return "0";
  return undefined;
}

export function searchableDropdownShortcutIndex(key: string): number | null {
  if (/^[1-9]$/.test(key)) return Number(key) - 1;
  if (key === "0") return 9;
  return null;
}
