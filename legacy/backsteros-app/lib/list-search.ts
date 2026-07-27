export function normalizeListSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesListSearch(
  haystack: string | null | undefined,
  query: string,
): boolean {
  const normalized = normalizeListSearchQuery(query);
  if (!normalized) {
    return true;
  }

  return (haystack ?? "").toLowerCase().includes(normalized);
}

export function matchesListSearchAny(
  query: string,
  ...haystacks: Array<string | null | undefined>
): boolean {
  const normalized = normalizeListSearchQuery(query);
  if (!normalized) {
    return true;
  }

  return haystacks.some((haystack) =>
    (haystack ?? "").toLowerCase().includes(normalized),
  );
}

export function filterListItems<T>(
  items: T[],
  query: string,
  getSearchFields: (item: T) => Array<string | null | undefined>,
): T[] {
  if (!normalizeListSearchQuery(query)) {
    return items;
  }

  return items.filter((item) =>
    matchesListSearchAny(query, ...getSearchFields(item)),
  );
}

export function hasActiveListSearch(query: string): boolean {
  return normalizeListSearchQuery(query).length > 0;
}

export function getListSearchEmptyMessage(
  query: string,
  defaultMessage: string,
): string {
  return hasActiveListSearch(query)
    ? "No results match your search."
    : defaultMessage;
}
