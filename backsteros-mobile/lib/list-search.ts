/** Shared list search helpers for More-section entity lists. */

export function normalizeListSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesListSearch(
  query: string,
  ...parts: Array<string | null | undefined>
): boolean {
  const needle = normalizeListSearchQuery(query);
  if (!needle) return true;
  return parts.some((part) => (part ?? "").toLowerCase().includes(needle));
}
