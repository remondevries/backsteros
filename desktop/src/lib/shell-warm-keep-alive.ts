
import {
  currentWindowNavigationHref,
  normalizeNavigationHref,
  parseNavigationPathname,
  resolvePendingPageSurface,
  type PendingPageSurface,
} from "./pending-navigation-routes";
/**
 * Heavy section panes stay mounted after the first visit. Hide them;
 * do not unmount. Org-scoped contacts/projects stay on Outlet.
 */
export const KEEP_ALIVE_SURFACES = new Set<PendingPageSurface>([
  "calendar",
  "inbox",
  "knowledge-v2",
  "tasks-list",
  "journal-v2",
  "habits-v2",
  "projects",
  "contacts",
  "organizations",
  "letters-v2",
]);

/**
 * Legacy section roots still appear in bookmarks / older Go bindings.
 * Remap so warm flips hit the keep-alive surfaces (same as left nav).
 */
export function remapLegacyKeepAliveHref(href: string): string {
  const normalized = normalizeNavigationHref(href);
  const pathname = parseNavigationPathname(normalized);
  const search = normalized.slice(pathname.length);

  if (pathname === "/journal" || pathname === "/journal/") {
    return `/journal-v2${search}`;
  }
  if (pathname.startsWith("/journal/habits")) {
    const rest = pathname.slice("/journal/habits".length);
    return `/habits-v2${rest}${search}`;
  }
  if (pathname.startsWith("/journal/")) {
    return `/journal-v2/${pathname.slice("/journal/".length)}${search}`;
  }
  if (pathname === "/knowledge" || pathname === "/knowledge/") {
    return `/knowledge-v2${search}`;
  }
  if (pathname.startsWith("/knowledge/")) {
    return `/knowledge-v2/${pathname.slice("/knowledge/".length)}${search}`;
  }
  if (pathname === "/letters" || pathname === "/letters/") {
    return `/letters-v2${search}`;
  }
  if (pathname.startsWith("/letters/")) {
    return `/letters-v2/${pathname.slice("/letters/".length)}${search}`;
  }
  return normalized;
}

const mountedKeepAliveSurfaces = new Set<PendingPageSurface>();
const lastKeepAliveHref = new Map<PendingPageSurface, string>();
const warmKeepAliveListeners = new Set<() => void>();

let visibleKeepAliveSurface: PendingPageSurface | null = null;
let warmKeepAlivePopstateInstalled = false;
/** Router still reports the previous page after a warm `pushState`. */
let warmFlipAwaitingRouter = false;

const KEEP_ALIVE_GO_ROOT: Partial<Record<PendingPageSurface, string>> = {
  calendar: "/calendar",
  inbox: "/inbox",
  "knowledge-v2": "/knowledge-v2",
  "tasks-list": "/tasks",
  "journal-v2": "/journal-v2",
  "habits-v2": "/habits-v2",
  projects: "/projects",
  contacts: "/contacts",
  organizations: "/organizations",
  "letters-v2": "/letters-v2",
};

function hrefFromParts(pathname: string, searchStr: string): string {
  if (!searchStr) return pathname;
  return `${pathname}${searchStr.startsWith("?") ? searchStr : `?${searchStr}`}`;
}

function emitWarmKeepAlive(): void {
  for (const listener of warmKeepAliveListeners) {
    listener();
  }
}

function assignVisibleKeepAliveSurface(
  surface: PendingPageSurface | null,
): boolean {
  if (visibleKeepAliveSurface === surface) return false;
  visibleKeepAliveSurface = surface;
  return true;
}

function followWarmKeepAliveUrl(href: string): void {
  if (typeof window === "undefined") return;
  const next = normalizeNavigationHref(href);
  if (currentWindowNavigationHref() === next) return;
  window.history.pushState(window.history.state, "", next);
}

export function shouldKeepAliveSurface(
  surface: PendingPageSurface,
  pathname: string,
): boolean {
  if (!KEEP_ALIVE_SURFACES.has(surface)) return false;
  const root = pathname.split("/").filter(Boolean)[0];
  if (
    surface === "projects" ||
    surface === "contacts" ||
    surface === "letters"
  ) {
    return root === surface;
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
  const surface = resolvePendingPageSurface(pathname);
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
  const pathname = parseNavigationPathname(href);
  const surface = resolvePendingPageSurface(href);
  return (
    mountedKeepAliveSurfaces.has(surface) &&
    shouldKeepAliveSurface(surface, pathname)
  );
}

function onWarmKeepAlivePopstate(): void {
  const href = currentWindowNavigationHref();
  const pathname = parseNavigationPathname(href);
  const surface = resolvePendingPageSurface(href);
  if (
    mountedKeepAliveSurfaces.has(surface) &&
    shouldKeepAliveSurface(surface, pathname)
  ) {
    rememberKeepAliveHref(surface, pathname, href.slice(pathname.length));
    if (assignVisibleKeepAliveSurface(surface)) {
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

/**
 * Chrome pathname/search while a keep-alive surface is showing and the
 * router still reports a different page (warm `pushState`).
 */
export function chromeHrefForWarmKeepAlive(
  _routerPathname?: string,
): string | null {
  if (visibleKeepAliveSurface == null) return null;
  return lastHrefForKeepAliveSurface(visibleKeepAliveSurface);
}

export function rememberKeepAliveHref(
  surface: PendingPageSurface,
  pathname: string,
  searchStr: string,
): void {
  lastKeepAliveHref.set(surface, hrefFromParts(pathname, searchStr));
}

/** Section-root go targets (`/tasks`) restore the last visit on that pane. */
export function resolveWarmKeepAliveHref(href: string): string {
  const normalized = normalizeNavigationHref(href);
  const surface = resolvePendingPageSurface(normalized);
  const last = lastKeepAliveHref.get(surface);
  if (!last) return normalized;
  const goRoot = KEEP_ALIVE_GO_ROOT[surface];
  if (goRoot && normalized === goRoot) return last;
  return normalized;
}

export function isWarmKeepAliveSectionFlip(href: string): boolean {
  const target = resolveWarmKeepAliveHref(href);
  if (!isKeepAlivePaneMounted(target)) return false;
  return visibleKeepAliveSurface !== resolvePendingPageSurface(target);
}

/**
 * Show an already-mounted keep-alive section without TanStack `navigate()`.
 * URL can follow via `history.pushState`. Same-pane query (`/tasks?due=`)
 * also wins once that pane is mounted. Returns false on first visit or Outlet.
 */
export function tryWarmKeepAliveFlip(href: string): boolean {
  ensureWarmKeepAlivePopstate();
  const normalized = remapLegacyKeepAliveHref(href);
  const surface = resolvePendingPageSurface(normalized);
  const pathname = parseNavigationPathname(normalized);
  if (
    !mountedKeepAliveSurfaces.has(surface) ||
    !shouldKeepAliveSurface(surface, pathname)
  ) {
    return false;
  }
  const target = resolveWarmKeepAliveHref(normalized);
  const targetPath = parseNavigationPathname(target);
  const targetSearch = target.slice(targetPath.length);
  const nextHref = hrefFromParts(targetPath, targetSearch);
  const alreadyVisible = visibleKeepAliveSurface === surface;
  if (alreadyVisible && lastKeepAliveHref.get(surface) === nextHref) {
    followWarmKeepAliveUrl(nextHref);
    return true;
  }
  rememberKeepAliveHref(surface, targetPath, targetSearch);
  warmFlipAwaitingRouter = true;
  assignVisibleKeepAliveSurface(surface);
  followWarmKeepAliveUrl(nextHref);
  emitWarmKeepAlive();
  return true;
}

/** Parent already re-rendering from a real location change — no emit. */
export function syncVisibleKeepAliveSurfaceFromRoute(
  surface: PendingPageSurface | null,
): void {
  assignVisibleKeepAliveSurface(surface);
}

/**
 * After a warm flip the router still reports the previous page. Ignore that
 * until the router matches the visible surface or leaves keep-alive.
 */
export function shouldApplyRouteKeepAliveSync(
  routerPathname: string,
  routerSearchStr = "",
): boolean {
  if (visibleKeepAliveSurface == null) {
    warmFlipAwaitingRouter = false;
    return true;
  }
  const routerHref = hrefFromParts(routerPathname, routerSearchStr);
  if (
    resolvePendingPageSurface(routerPathname) === visibleKeepAliveSurface &&
    routerHref === lastHrefForKeepAliveSurface(visibleKeepAliveSurface)
  ) {
    warmFlipAwaitingRouter = false;
    return true;
  }
  if (!warmFlipAwaitingRouter) return true;
  if (typeof window === "undefined") return false;
  if (
    resolvePendingPageSurface(currentWindowNavigationHref()) !==
    visibleKeepAliveSurface
  ) {
    warmFlipAwaitingRouter = false;
    return true;
  }
  return false;
}

export function markKeepAliveSurfaceMounted(surface: PendingPageSurface): void {
  mountedKeepAliveSurfaces.add(surface);
}

export function resetKeepAliveForTests(): void {
  mountedKeepAliveSurfaces.clear();
  lastKeepAliveHref.clear();
  visibleKeepAliveSurface = null;
  warmFlipAwaitingRouter = false;
}
