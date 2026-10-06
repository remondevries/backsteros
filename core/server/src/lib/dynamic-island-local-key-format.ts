export const DYNAMIC_ISLAND_API_KEY_NAME = "dynamic-island";
export const DYNAMIC_ISLAND_SCOPES = ["tasks:read", "projects:read"] as const;
export const DYNAMIC_ISLAND_DEFAULT_API_URL = "http://127.0.0.1:8788";

/** Pair-flow keys: fixed name, exact read-only scopes, no contactId. */
export function isPairFlowIslandKey(row: {
  contactId: string | null;
  scopes: string[] | null | undefined;
}): boolean {
  if (row.contactId != null) return false;
  const expected = [...DYNAMIC_ISLAND_SCOPES].sort();
  const actual = [...(row.scopes ?? [])].sort();
  return (
    expected.length === actual.length &&
    expected.every((scope, index) => scope === actual[index])
  );
}
