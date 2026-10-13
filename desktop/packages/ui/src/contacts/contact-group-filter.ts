/** Search param: filter the contacts catalog by CRM group id. */
export const CRM_GROUP_PARAM = "crmGroup";

export function parseCrmGroupId(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const id = params.get(CRM_GROUP_PARAM)?.trim();
  return id || null;
}

/** Merge or clear `crmGroup` on an existing search string. */
export function withCrmGroupSearch(
  search: string,
  groupId: string | null,
): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (groupId) params.set(CRM_GROUP_PARAM, groupId);
  else params.delete(CRM_GROUP_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}

/** Catalog root with optional group filter (`/contacts` or `/contacts?crmGroup=`). */
export function getContactsGroupHref(groupId: string | null): string {
  return `/contacts${withCrmGroupSearch("", groupId)}`;
}

/** Catalog root with optional group filter (`/organizations` or `?crmGroup=`). */
export function getOrganizationsGroupHref(groupId: string | null): string {
  return `/organizations${withCrmGroupSearch("", groupId)}`;
}

/** Append (or replace) search onto a path that may already include `?…`. */
export function mergeHrefSearch(path: string, search: string): string {
  if (!search || search === "?") return path;
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (!query) return path;
  const [pathname, existing = ""] = path.split("?");
  const merged = new URLSearchParams(existing);
  for (const [key, value] of new URLSearchParams(query)) {
    merged.set(key, value);
  }
  const next = merged.toString();
  return next ? `${pathname}?${next}` : pathname;
}
