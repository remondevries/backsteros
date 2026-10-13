/** True when this page is still the matched route (Outlet may linger one commit). */
export function isRoutePathActive(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** Journal day — not /journal/habits. */
export function isJournalDayPath(pathname: string): boolean {
  if (pathname === "/journal") return true;
  return (
    pathname.startsWith("/journal/") && !pathname.startsWith("/journal/habits")
  );
}
