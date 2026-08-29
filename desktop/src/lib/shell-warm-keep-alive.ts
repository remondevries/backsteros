import {
  currentWindowNavigationHref,
  normalizeNavigationHref,
  parseNavigationPathname,
  resolveAppHref,
  formatResolvedAppHref,
  type PendingPageSurface,
} from "./pending-navigation-routes";
import { rememberSectionEntryFromNav } from "./section-entry-store";
/**
 * Heavy section panes stay mounted after the first visit. Hide them;
 * do not unmount. Org-scoped contacts/projects stay on Outlet.
 */
export const KEEP_ALIVE_SURFACES = new Set<PendingPageSurface>([
  "calendar",
  "inbox",
  "knowledge",
  "tasks-list",
  "journal-day",
  "journal-habits",
  "projects",
  "contacts",
  "organizations",
  "letters",
]);

const mountedKeepAliveSurfaces = new Set<PendingPageSurface>();
const lastKeepAliveHref = new Map<PendingPageSurface, string>();
const warmKeepAliveListeners = new Set<() => void>();

let visibleKeepAliveSurface: PendingPageSurface | null = null;
let warmKeepAlivePopstateInstalled = false;
/** Bumps on every warm emit so same-surface href flips still re-render. */
let warmKeepAliveEpoch = 0;

const KEEP_ALIVE_GO_ROOT: Partial<Record<PendingPageSurface, string>> = {
  calendar: "/calendar",
  inbox: "/inbox",
  knowledge: "/knowledge",
  "tasks-list": "/tasks",
  "journal-day": "/journal",
  "journal-habits": "/journal/habits",
  projects: "/projects",
  contacts: "/contacts",
  organizations: "/organizations",
  letters: "/letters",
};

function hrefFromParts(pathname: string, searchStr: string): string {
  if (!searchStr) return pathname;
  return `${pathname}${searchStr.startsWith("?") ? searchStr : `?${searchStr}`}`;
}

function emitWarmKeepAlive(): void {
  warmKeepAliveEpoch += 1;
  for (const listener of warmKeepAliveListeners) {
    listener();
  }
}

export function getWarmKeepAliveEpoch(): number {
  return warmKeepAliveEpoch;
}

function assignVisibleKeepAliveSurface(
  surface: PendingPageSurface | null,
): boolean {
  if (visibleKeepAliveSurface === surface) return false;
  visibleKeepAliveSurface = surface;
  return true;
}

function followWarmKeepAliveUrl(href: string, replace = false): void {
  if (typeof window === "undefined") return;
  const next = normalizeNavigationHref(href);
  if (currentWindowNavigationHref() === next) return;
  // TanStack's createBrowserHistory patches window.history.pushState/replaceState
  // and notifies the router on every call. Same-surface warm flips must update
  // the address bar without rematching routes — that remounts ShellRouteContent
  // and destroys keep-alive panes.
  const method = replace ? "replaceState" : "pushState";
  History.prototype[method].call(window.history, window.history.state, "", next);
}

export function shouldKeepAliveSurface(
  surface: PendingPageSurface,
  pathname: string,
): boolean {
  if (!KEEP_ALIVE_SURFACES.has(surface)) return false;
  const root = pathname.split("/").filter(Boolean)[0];
  if (surface === "projects" || surface === "contacts") {
    return root === surface;
  }
  if (surface === "letters") {
    return root === "letters";
  }
  if (surface === "knowledge") {
    return root === "knowledge";
  }
  if (surface === "journal-day" || surface === "journal-habits") {
    return resolveAppHref(pathname).surface === surface;
  }
  if (surface === "organizations") return root === "organizations";
  return true;
}

export function shouldKeepAliveSidePanelSurface(
  surface: PendingPageSurface,
  pathname: string,
): boolean {
  if (!shouldKeepAliveSurface(surface, pathname)) return false;
  return true;
}

export function keepAliveSidePanelSurface(
  pathname: string,
): PendingPageSurface | null {
  const surface = resolveAppHref(pathname).surface;
  return shouldKeepAliveSidePanelSurface(surface, pathname) ? surface : null;
}

/** Tasks list and /projects root have no list chrome — do not reserve a column. */
export function keepAliveDestinationShowsSidePanel(pathname: string): boolean {
  const surface = keepAliveSidePanelSurface(pathname);
  if (surface == null) return false;
  if (surface === "tasks-list") return false;
  if (surface === "projects") {
    return pathname.split("/").filter(Boolean).length >= 2;
  }
  return true;
}

export function isKeepAliveSurface(
  surface: PendingPageSurface,
  pathname?: string,
): boolean {
  if (pathname == null) return KEEP_ALIVE_SURFACES.has(surface);
  return shouldKeepAliveSurface(surface, pathname);
}

export function isKeepAlivePaneMounted(href: string): boolean {
  const resolved = resolveAppHref(href);
  return (
    mountedKeepAliveSurfaces.has(resolved.surface) &&
    shouldKeepAliveSurface(resolved.surface, resolved.pathname)
  );
}

function onWarmKeepAlivePopstate(): void {
  const href = currentWindowNavigationHref();
  const resolved = resolveAppHref(href);
  if (
    mountedKeepAliveSurfaces.has(resolved.surface) &&
    shouldKeepAliveSurface(resolved.surface, resolved.pathname)
  ) {
    rememberKeepAliveHref(
      resolved.surface,
      resolved.pathname,
      resolved.search,
    );
    if (assignVisibleKeepAliveSurface(resolved.surface)) {
      emitWarmKeepAlive();
    }
    return;
  }
  if (assignVisibleKeepAliveSurface(null)) {
    emitWarmKeepAlive();
  }
}

function ensureWarmKeepAlivePopstate(): void {
  if (warmKeepAlivePopstateInstalled || typeof window === "undefined") {
    return;
  }
  warmKeepAlivePopstateInstalled = true;
  window.addEventListener("popstate", onWarmKeepAlivePopstate);
}

export function getVisibleKeepAliveSurface(): PendingPageSurface | null {
  return visibleKeepAliveSurface;
}

export function subscribeWarmKeepAlive(onChange: () => void): () => void {
  warmKeepAliveListeners.add(onChange);
  return () => {
    warmKeepAliveListeners.delete(onChange);
  };
}

export function lastHrefForKeepAliveSurface(
  surface: PendingPageSurface,
): string {
  return lastKeepAliveHref.get(surface) ?? KEEP_ALIVE_GO_ROOT[surface] ?? "/";
}

/**
 * Href for the visible keep-alive surface. Null when Outlet (or nothing
 * keep-alive) is showing — callers fall back to the router.
 */
export function visibleKeepAliveHref(): string | null {
  if (visibleKeepAliveSurface == null) return null;
  return lastHrefForKeepAliveSurface(visibleKeepAliveSurface);
}

export function partsFromKeepAliveHref(href: string): {
  pathname: string;
  searchStr: string;
} {
  const pathname = parseNavigationPathname(href);
  return {
    pathname,
    searchStr: href.startsWith(pathname) ? href.slice(pathname.length) : "",
  };
}

export function rememberKeepAliveHref(
  surface: PendingPageSurface,
  pathname: string,
  searchStr: string,
): void {
  lastKeepAliveHref.set(surface, hrefFromParts(pathname, searchStr));
}

/**
 * Inbox list stays mounted while viewing `/email/…?list=inbox`, but email is
 * not its own keep-alive surface. Mirror the email href onto the inbox pane
 * so selection + j/k stay on the open message instead of the previous task.
 */
export function rememberInboxPanelSelectionHref(href: string): boolean {
  if (!mountedKeepAliveSurfaces.has("inbox")) return false;
  const resolved = resolveAppHref(href);
  if (!resolved.pathname.startsWith("/email/")) return false;
  const params = new URLSearchParams(
    resolved.search.startsWith("?")
      ? resolved.search.slice(1)
      : resolved.search,
  );
  if (params.get("list") !== "inbox") return false;
  const nextHref = formatResolvedAppHref(resolved);
  if (lastKeepAliveHref.get("inbox") === nextHref) return false;
  rememberKeepAliveHref("inbox", resolved.pathname, resolved.search);
  emitWarmKeepAlive();
  return true;
}

/**
 * Section-root targets after {@link resolveAppHref}. Kept for tests / callers
 * that still want the formatted href string.
 */
export function resolveWarmKeepAliveHref(href: string): string {
  return formatResolvedAppHref(resolveAppHref(href));
}

/**
 * Clear a visible keep-alive pane before TanStack owns navigation (warm flip
 * already returned false).
 *
 * Warm flips leave the TanStack match on a previous path. Re-clicking an Outlet
 * item (e.g. Development) is a router no-op unless we dismiss and pushState.
 *
 * First visit to another keep-alive section (g+t while Calendar is showing,
 * Tasks not mounted yet): only clear `visible`. Do not pushState — TanStack
 * navigate mounts the pane and ShellRouteContent syncs. Clearing lets
 * KeepAlivePane fall back to `activeProp` on that commit; leaving the old
 * `visible` stuck the previous section on screen until a second g+/click
 * warm-flipped.
 */
export function dismissKeepAliveForOutletNavigation(href: string): boolean {
  const visible = visibleKeepAliveSurface;
  if (visible == null) return false;
  const resolved = resolveAppHref(href);
  if (resolved.surface === visible) return false;

  assignVisibleKeepAliveSurface(null);
  emitWarmKeepAlive();

  if (shouldKeepAliveSurface(resolved.surface, resolved.pathname)) {
    return true;
  }

  followWarmKeepAliveUrl(formatResolvedAppHref(resolved));
  return true;
}

export function isWarmKeepAliveSectionFlip(href: string): boolean {
  const target = formatResolvedAppHref(resolveAppHref(href));
  if (!isKeepAlivePaneMounted(target)) return false;
  return visibleKeepAliveSurface !== resolveAppHref(target).surface;
}

/**
 * Show an already-mounted keep-alive section without TanStack `navigate()`.
 * URL can follow via `history.pushState` / `replaceState`. Same-pane query
 * (`/tasks?due=`, `/calendar?meeting=`) also wins once that pane is mounted.
 * Returns false on first visit or Outlet.
 *
 * `href` may be a logical click target — resolved once via {@link resolveAppHref}.
 */
export function tryWarmKeepAliveFlip(
  href: string,
  options?: { replace?: boolean },
): boolean {
  ensureWarmKeepAlivePopstate();
  const resolved = resolveAppHref(href);
  if (
    !mountedKeepAliveSurfaces.has(resolved.surface) ||
    !shouldKeepAliveSurface(resolved.surface, resolved.pathname)
  ) {
    return false;
  }
  const nextHref = formatResolvedAppHref(resolved);
  const replace = options?.replace ?? false;
  const alreadyVisible = visibleKeepAliveSurface === resolved.surface;
  if (alreadyVisible && lastKeepAliveHref.get(resolved.surface) === nextHref) {
    followWarmKeepAliveUrl(nextHref, replace);
    // Surface unchanged — still emit so panes re-read lastHref (native push
    // no longer wakes the router).
    emitWarmKeepAlive();
    rememberSectionEntryFromNav(nextHref);
    return true;
  }
  rememberKeepAliveHref(resolved.surface, resolved.pathname, resolved.search);
  assignVisibleKeepAliveSurface(resolved.surface);
  followWarmKeepAliveUrl(nextHref, replace);
  emitWarmKeepAlive();
  rememberSectionEntryFromNav(nextHref);
  return true;
}

/**
 * True when TanStack's location matches the address bar. After a warm
 * `pushState` they disagree — the keep-alive store owns "where am I?" and
 * must not be overwritten from the stale router match.
 */
export function routerAgreesWithWindow(
  routerPathname: string,
  routerSearchStr = "",
): boolean {
  if (typeof window === "undefined") return true;
  return (
    currentWindowNavigationHref() ===
    normalizeNavigationHref(hrefFromParts(routerPathname, routerSearchStr))
  );
}

/** Parent already re-rendering from a real location change — no emit. */
export function syncVisibleKeepAliveSurfaceFromRoute(
  surface: PendingPageSurface | null,
): void {
  assignVisibleKeepAliveSurface(surface);
}

export function markKeepAliveSurfaceMounted(surface: PendingPageSurface): void {
  mountedKeepAliveSurfaces.add(surface);
}

export function listMountedKeepAliveSurfaces(): PendingPageSurface[] {
  return Array.from(mountedKeepAliveSurfaces);
}

export function resetKeepAliveForTests(): void {
  mountedKeepAliveSurfaces.clear();
  lastKeepAliveHref.clear();
  visibleKeepAliveSurface = null;
  warmKeepAliveEpoch = 0;
}
