import {
  isFinanceSectionPath,
  isInboxPanelPath,
} from "@backsteros/ui/navigation";

import {
  currentWindowNavigationHref,
  normalizeNavigationHref,
  parseNavigationPathname,
  type PendingPageSurface,
} from "./pending-navigation-routes";
import {
  KEEP_ALIVE_SURFACES,
  isKeepAliveOutletTransitionPending,
  keepAliveDestinationShowsSidePanel,
  keepAliveSidePanelSurface,
  lastHrefForKeepAliveSurface,
  partsFromKeepAliveHref,
} from "./shell-warm-keep-alive";

/** Keep-alive list surfaces, or remount-on-purpose live dests. */
export type LeftSidePanelDest = PendingPageSurface | "finance";

/**
 * Surfaces that mount a real tree in the shell left list (not embedded-in-page).
 * Keep in sync with `keepAliveSidePanelTree` in shell-keep-alive-side-panels.
 */
const SHELL_LIST_SURFACES = new Set<PendingPageSurface>([
  "inbox",
  "calendar",
  "journal-day",
  "journal-habits",
  "knowledge",
  "contacts",
  "organizations",
  "letters",
]);

function hrefFromPathSearch(pathname: string, search = ""): string {
  if (!search) return pathname;
  return `${pathname}${search.startsWith("?") ? search : `?${search}`}`;
}

/**
 * After warm `pushState`, TanStack can still report the previous Outlet URL
 * (e.g. `/email?list=inbox`) while the address bar already moved. Prefer the
 * window when they disagree so dismiss cannot revive Inbox from stale router.
 */
function trustedChromePath(
  pathname: string,
  search = "",
  windowHref?: string,
): { pathname: string; search: string } {
  const href =
    windowHref ??
    (typeof window !== "undefined" ? currentWindowNavigationHref() : null);
  if (
    href == null ||
    normalizeNavigationHref(href) ===
      normalizeNavigationHref(hrefFromPathSearch(pathname, search))
  ) {
    return { pathname, search };
  }
  const path = parseNavigationPathname(href);
  const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  return { pathname: path, search: query };
}

function chromeIsInboxEmailList(pathname: string, search = ""): boolean {
  return pathname.startsWith("/email") && isInboxPanelPath(pathname, search);
}

/**
 * True when this warm surface should own the shell left list column.
 * Knowledge only has a list inside a space (not on /spaces root).
 */
export function visibleSurfaceOwnsShellSidePanel(
  surface: PendingPageSurface,
): boolean {
  if (!SHELL_LIST_SURFACES.has(surface)) return false;
  if (surface === "knowledge") {
    const path = partsFromKeepAliveHref(
      lastHrefForKeepAliveSurface(surface),
    ).pathname;
    return keepAliveDestinationShowsSidePanel(path);
  }
  return true;
}

/**
 * One resolver: location (+ optional sync warm surface) → left panel destination.
 *
 * When `visibleSurface` is set (warm keep-alive section), it is authoritative —
 * chrome pathname can lag a frame after tab flips and must not reopen a stale
 * Inbox list while Communication is already showing (or vice versa).
 *
 * When `visibleSurface` is null (Outlet: email, settings, finance), fall back
 * to pathname / `inInboxPanel` / finance flags.
 */
export function resolveLeftSidePanelDest(input: {
  pathname: string;
  search?: string;
  inInboxPanel: boolean;
  /** @deprecated Communication no longer mounts a shell side panel. */
  inCommunicationPanel?: boolean;
  financeSection: boolean;
  showSidePanel: boolean;
  /** Sync warm keep-alive surface (updates immediately on tab flip). */
  visibleSurface?: PendingPageSurface | null;
  /**
   * Between dismiss() and route sync. When omitted, reads the live store flag.
   */
  outletTransitionPending?: boolean;
  /**
   * Address-bar href override (tests). Live code reads `window.location`.
   * Used when TanStack lags after warm `pushState`.
   */
  windowHref?: string;
}): LeftSidePanelDest | null {
  const outletPending =
    input.outletTransitionPending ?? isKeepAliveOutletTransitionPending();
  const search = input.search ?? "";
  const chrome = trustedChromePath(input.pathname, search, input.windowHref);

  // Email Outlet from Inbox (`/email/…?list=inbox`) — visible is cleared while
  // the list stays mounted. Trust the address bar when TanStack still shows a
  // stale email match after a warm flip + dismiss.
  if (
    input.visibleSurface == null &&
    chromeIsInboxEmailList(chrome.pathname, chrome.search)
  ) {
    return "inbox";
  }

  if (input.visibleSurface != null) {
    if (visibleSurfaceOwnsShellSidePanel(input.visibleSurface)) {
      return input.visibleSurface;
    }
    // Warm section with no shell list (Communication, Tasks, …).
    return null;
  }

  const chromeHref = normalizeNavigationHref(
    hrefFromPathSearch(chrome.pathname, chrome.search),
  );
  const inputHref = normalizeNavigationHref(
    hrefFromPathSearch(input.pathname, search),
  );
  const chromeDisagrees = chromeHref !== inputHref;

  // Dismiss / popstate / warm lag: TanStack may still be on another URL.
  // Inbox email already returned above. Preserve finance from trusted chrome;
  // never revive a keep-alive list (Calendar, …) while URLs disagree — main
  // may still be on Outlet; sync/visible owns list dest once History catches up.
  if (outletPending || chromeDisagrees) {
    if (isFinanceSectionPath(chrome.pathname)) return "finance";
    return null;
  }

  // Outlet / non-keep-alive: finance or pathname-based dests (URLs agree).
  if (input.financeSection && input.showSidePanel) return "finance";
  if (!input.showSidePanel) return null;

  const surface = keepAliveSidePanelSurface(input.pathname);
  if (surface == null) return null;
  if (surface === "communication") return null;
  if (!KEEP_ALIVE_SURFACES.has(surface)) return null;
  if (!SHELL_LIST_SURFACES.has(surface)) return null;
  // Pathname-based: use this path (not lastHref) for knowledge space gate.
  if (!keepAliveDestinationShowsSidePanel(input.pathname)) return null;
  return surface;
}

export function isKeepAliveLeftSidePanelDest(
  dest: LeftSidePanelDest | null,
): dest is PendingPageSurface {
  return dest != null && dest !== "finance" && KEEP_ALIVE_SURFACES.has(dest);
}
