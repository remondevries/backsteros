import {
  currentWindowNavigationHref,
  parseNavigationPathname,
} from "./pending-navigation-routes";
import type { PendingPageSurface } from "./pending-navigation-routes";

export function pathNeedsAgentMail(pathname: string): boolean {
  return (
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/") ||
    pathname === "/communication" ||
    pathname.startsWith("/communication/") ||
    pathname === "/email" ||
    pathname.startsWith("/email/") ||
    pathname.startsWith("/desktop-overlay/compose")
  );
}

/** Router outlet paths that need AgentMail even when another section stays warm. */
export function isEmailOutletPath(pathname: string): boolean {
  return (
    pathname === "/email" ||
    pathname.startsWith("/email/") ||
    pathname.startsWith("/desktop-overlay/compose")
  );
}

/**
 * Inbox / Communication enable/live follows `visibleKeepAliveSurface`, not the
 * router. Email / compose stay on Outlet — read the window href for mailboxes.
 */
export function shouldLiveUpdateAgentMail(
  visible: PendingPageSurface | null,
  pathname: string = parseNavigationPathname(currentWindowNavigationHref()),
): boolean {
  if (visible === "inbox" || visible === "communication") return true;
  if (isEmailOutletPath(pathname)) return true;
  if (visible != null) return false;
  return pathNeedsAgentMail(pathname);
}
