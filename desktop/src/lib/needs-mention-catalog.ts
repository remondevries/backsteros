/**
 * Surfaces with markdown / comment editors that support `@` mentions.
 * Calendar overlays use `/calendar?meeting=` (and `?task=`), not only
 * `/calendar/meetings/…` — keep the whole calendar section live.
 *
 * Path checks are inlined (not via `@backsteros/ui`) so Node tests do not
 * pull the UI package CSS graph.
 */
export function needsMentionCatalog(
  pathname: string,
  composeOpen: boolean,
): boolean {
  if (composeOpen) return true;
  if (pathname.startsWith("/tasks/")) return true;
  if (pathname === "/knowledge" || pathname.startsWith("/knowledge/")) {
    return true;
  }
  if (pathname === "/letters" || pathname.startsWith("/letters/")) return true;
  if (pathname === "/journal" || pathname.startsWith("/journal/")) return true;
  if (pathname === "/email" || pathname.startsWith("/email/")) return true;
  if (pathname === "/inbox" || pathname.startsWith("/inbox/")) return true;
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) {
    return true;
  }
  if (pathname === "/projects" || pathname.startsWith("/projects/")) {
    return true;
  }
  if (pathname === "/finance" || pathname.startsWith("/finance/")) return true;
  if (pathname === "/contacts" || pathname.startsWith("/contacts/")) {
    return true;
  }
  if (
    pathname === "/organizations" ||
    pathname.startsWith("/organizations/")
  ) {
    return true;
  }
  return false;
}
