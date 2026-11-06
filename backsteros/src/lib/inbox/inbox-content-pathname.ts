import { isInboxEmailShellPath } from "@backsteros/ui";

import {
  currentWindowNavigationHref,
  parseNavigationPathname,
} from "../pending-navigation-routes";

/**
 * Path the content pane is actually showing.
 *
 * Inbox keep-alive can mirror `/email/…` onto the side panel before TanStack
 * commits the outlet. Open-target / open-on-highlight must use the real
 * window path in that case, or delete→neighbor is skipped while the outlet
 * stays on the deleted thread.
 */
export function resolveInboxContentPathname(shellPathname: string): string {
  if (typeof window === "undefined") return shellPathname;
  const windowPath = parseNavigationPathname(currentWindowNavigationHref());
  if (
    isInboxEmailShellPath(windowPath) ||
    isInboxEmailShellPath(shellPathname)
  ) {
    return windowPath;
  }
  return shellPathname;
}

/** True when `href` already matches the live content path (ignore query). */
export function inboxContentAlreadyShowsHref(href: string): boolean {
  if (typeof window === "undefined") return false;
  const targetPath = href.split(/[?#]/, 1)[0] ?? href;
  const windowPath = parseNavigationPathname(currentWindowNavigationHref());
  return windowPath === targetPath;
}
