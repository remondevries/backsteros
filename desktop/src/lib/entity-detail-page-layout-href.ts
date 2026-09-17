import {
  CONTACT_OVERLAY_LAYOUT_PARAM,
  parseContactOverlayLayout,
} from "../../packages/ui/src/contacts/contact-overlay.js";
import {
  ORGANIZATION_OVERLAY_LAYOUT_PARAM,
  parseOrganizationOverlayLayout,
} from "../../packages/ui/src/organizations/organization-overlay.js";

import { parseAppHref } from "../router/navigate-href";

/**
 * Standalone contact/org detail URLs default to the narrow panel layout.
 * Append the page-layout search param so navigation opens the expanded
 * workspace (Meetings, Tasks, … tabs) instead.
 */
export function withEntityDetailPageLayout(href: string): string {
  const { pathname, search, hash } = parseAppHref(href);
  const searchStr = search
    ? `?${new URLSearchParams(search).toString()}`
    : "";

  if (/^\/contacts\/[^/]+/.test(pathname) && !pathname.startsWith("/contacts/new")) {
    if (parseContactOverlayLayout(searchStr) === "page") {
      return href;
    }
    const params = new URLSearchParams(search ?? {});
    params.set(CONTACT_OVERLAY_LAYOUT_PARAM, "page");
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}${hash ?? ""}`;
  }

  if (
    /^\/organizations\/[^/]+/.test(pathname) &&
    !pathname.startsWith("/organizations/new")
  ) {
    if (parseOrganizationOverlayLayout(searchStr) === "page") {
      return href;
    }
    const params = new URLSearchParams(search ?? {});
    params.set(ORGANIZATION_OVERLAY_LAYOUT_PARAM, "page");
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}${hash ?? ""}`;
  }

  return href;
}
