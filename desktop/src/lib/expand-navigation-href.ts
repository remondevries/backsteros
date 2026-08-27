import { getDefaultSettingsHref } from "@backsteros/ui";

import {
  normalizeNavigationHref,
  parseNavigationPathname,
} from "./pending-navigation-routes";
import { peekSectionEntryHref } from "./section-entry-hrefs";

/**
 * Turn logical sidebar / G+T hrefs into the URL the router will actually
 * show. Inbox / knowledge / letters / journal stay on the list root —
 * first-row selection is the keep-alive pane snapshot, not a redirect.
 */
export function expandNavigationHref(href: string): string {
  const normalized = normalizeNavigationHref(href);
  const pathname = parseNavigationPathname(normalized);
  const queryIndex = normalized.indexOf("?");
  const search = queryIndex >= 0 ? normalized.slice(queryIndex) : "";

  if (pathname === "/contacts") {
    const first = peekSectionEntryHref("contacts");
    if (first) return `${first}${search}`;
  }
  if (pathname === "/organizations") {
    const first = peekSectionEntryHref("organizations");
    if (first) return `${first}${search}`;
  }
  if (pathname === "/email") {
    return `/inbox${search}`;
  }
  if (pathname === "/finance") {
    return `/finance/dashboard${search}`;
  }
  if (pathname === "/settings") {
    return `${getDefaultSettingsHref()}${search}`;
  }
  return normalized;
}
