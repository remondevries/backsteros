/**
 * Clerk finishes popup OAuth on accounts.dev `/popup-callback` with
 * `__clerk_handshake` / `__clerk_db_jwt` query params, then postMessages the
 * session to `window.opener`. In packaged Tauri that handoff often never
 * reaches the main shell — so the native layer relays the query string here.
 */

const CLERK_HANDOFF_PARAM_PREFIX = "__clerk_";

export function mergeClerkHandshakeQuery(
  currentHref: string,
  rawQuery: string,
): string | null {
  const query = rawQuery.replace(/^\?/, "").trim();
  if (!query) return null;

  const incoming = new URLSearchParams(query);
  const url = new URL(currentHref);
  let changed = false;

  for (const [key, value] of incoming.entries()) {
    if (!key.startsWith(CLERK_HANDOFF_PARAM_PREFIX) || !value) continue;
    if (url.searchParams.get(key) === value) continue;
    url.searchParams.set(key, value);
    changed = true;
  }

  return changed ? url.toString() : null;
}

export function clerkHandshakeQueryFromUrl(href: string): string | null {
  try {
    const url = new URL(href);
    const kept = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (key.startsWith(CLERK_HANDOFF_PARAM_PREFIX) && value) {
        kept.set(key, value);
      }
    }
    const query = kept.toString();
    return query || null;
  } catch {
    return null;
  }
}
