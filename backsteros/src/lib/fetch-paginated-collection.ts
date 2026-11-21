/**
 * Walk `paginated=true` cursor pages so REST hydrate does not silently lose
 * rows after legacy list hard-caps (projects/contacts/orgs/letters ≤ 200).
 */

const MAX_PAGES = 100;
const PAGE_LIMIT = 200;

type RequestJson = <T>(
  path: string,
  init?: { signal?: AbortSignal },
) => Promise<T>;

export async function fetchAllPaginatedCollection<T>(
  requestJson: RequestJson,
  path: string,
  legacyKey: string,
  signal?: AbortSignal,
  extraQuery?: Record<string, string>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      paginated: "true",
      limit: String(PAGE_LIMIT),
      ...extraQuery,
    });
    if (cursor) params.set("cursor", cursor);
    const sep = path.includes("?") ? "&" : "?";
    const body = await requestJson<{
      items?: T[];
      nextCursor?: string | null;
      [key: string]: unknown;
    }>(`${path}${sep}${params.toString()}`, { signal });
    if (Array.isArray(body.items)) {
      out.push(...body.items);
      cursor = body.nextCursor ?? undefined;
      if (!cursor) break;
      continue;
    }
    const legacy = body[legacyKey];
    if (Array.isArray(legacy)) {
      out.push(...(legacy as T[]));
    }
    break;
  }
  return out;
}
