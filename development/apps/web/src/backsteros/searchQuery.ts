/** Case-insensitive substring match across any of the provided fields. */
export function matchesBacksterosSearchQuery(
  fields: ReadonlyArray<string | number | null | undefined>,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;
  return fields.some((field) => {
    if (field == null) return false;
    return String(field).toLowerCase().includes(normalizedQuery);
  });
}
