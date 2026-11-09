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
  "communication",
  "social",
]);

const mountedKeepAliveSurfaces = new Set<PendingPageSurface>();
/** Fallback when no product-tab binding is active yet (first mount / tests). */
const lastKeepAliveHref = new Map<PendingPageSurface, string>();
/**
 * Per product-tab bookmark for warm surfaces. Two Inbox (or Tasks/…) tabs must
 * not share one surface-global lastHref — each tab keeps its own selection.
 */
const lastHrefByTabId = new Map<string, string>();
let activeProductTabId: string | null = null;
/**
 * Bumps when the active product tab changes. Async panel loads / late remember
 * calls capture this and no-op if the user already switched away.
 */
let warmNavGeneration = 0;
/** Pane / outlet listeners — notified synchronously so DOM can flip this frame. */
const warmKeepAliveListeners = new Set<() => void>();
/**
 * Chrome listeners (tabs, side-panel host, shortcuts). Deferred to the next
 * animation frame so content visibility paint is not blocked by ~20 chrome
 * re-renders (perf logs: chromeLocationWakes 21–25 before raf1).
 */
const warmKeepAliveChromeListeners = new Set<() => void>();
let warmChromeEmitScheduled = false;

let visibleKeepAliveSurface: PendingPageSurface | null = null;
/**
 * Set by dismiss() until the next route sync — blocks pathname fallback to the
 * previous list dest while TanStack is still on the old URL.
 */
let outletTransitionPending = false;
let warmKeepAlivePopstateInstalled = false;
/** Bumps on every warm emit so same-surface href flips still re-render. */
let warmKeepAliveEpoch = 0;

const KEEP_ALIVE_GO_ROOT: Partial<Record<PendingPageSurface, string>> = {
  calendar: "/calendar",
  inbox: "/inbox",
  knowledge: "/spaces",
  "tasks-list": "/tasks",
  "journal-day": "/journal",
  "journal-habits": "/journal/habits",
  projects: "/projects",
  contacts: "/contacts",
  organizations: "/organizations",
  letters: "/letters",
  communication: "/communication",
  social: "/social",
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
  if (warmKeepAliveChromeListeners.size === 0) return;
  if (warmChromeEmitScheduled) return;
  warmChromeEmitScheduled = true;
  // One frame after sync pane listeners so content visibility flips first.
  requestAnimationFrame(() => {
    warmChromeEmitScheduled = false;
    for (const listener of warmKeepAliveChromeListeners) {
      listener();
    }
  });
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
    return root === "spaces" || root === "knowledge";
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
  // Spaces overview has no list chrome — panel only inside a space.
  if (surface === "knowledge") {
    return pathname.split("/").filter(Boolean).length >= 2;
  }
  return true;
}

export function keepAliveSidePanelSurface(
  pathname: string,
): PendingPageSurface | null {
  // Contact-scoped nested details (tasks / letters / meetings) still use the
  // contacts list panel even when the page surface is task-detail / letters /
  // outlet-only.
  if (pathname === "/contacts" || pathname.startsWith("/contacts/")) {
    return "contacts";
  }
  const surface = resolveAppHref(pathname).surface;
  return shouldKeepAliveSidePanelSurface(surface, pathname) ? surface : null;
}

/** Tasks list and /projects|/spaces roots have no list chrome — do not reserve a column. */
export function keepAliveDestinationShowsSidePanel(pathname: string): boolean {
  const surface = keepAliveSidePanelSurface(pathname);
  if (surface == null) return false;
  if (surface === "tasks-list") return false;
  if (surface === "social") return false;
  if (surface === "communication") return false;
  if (surface === "projects") {
    return pathname.split("/").filter(Boolean).length >= 2;
  }
  if (surface === "knowledge") {
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

/**
 * Browser/OS Back/Forward semantics (product tabs):
 * - Does **not** switch which product tab is active.
 * - Updates the **active** tab’s warm bookmark + address bar for the history
 *   entry (shared window history while that tab is focused).
 * - In-app chrome Back/Forward stays per-tab via navigation-history stacks.
 */
/**
 * Apply an OS Back/Forward landing. Exported for tests; live popstate uses
 * {@link currentWindowNavigationHref}.
 */
export function applyWarmKeepAlivePopstateHref(href: string): void {
  const resolved = resolveAppHref(href);
  if (
    mountedKeepAliveSurfaces.has(resolved.surface) &&
    shouldKeepAliveSurface(resolved.surface, resolved.pathname)
  ) {
    // Bind to the active product tab only — popstate never retargets siblings.
    rememberKeepAliveHref(
      resolved.surface,
      resolved.pathname,
      resolved.search,
      activeProductTabId
        ? { tabId: activeProductTabId, generation: warmNavGeneration }
        : undefined,
    );
    outletTransitionPending = false;
    assignVisibleKeepAliveSurface(resolved.surface);
    emitWarmKeepAlive();
    return;
  }
  // Back/Forward onto Outlet — TanStack can lag the address bar. Mark pending
  // so dest trusts chrome (same as dismiss) instead of a stale list pathname.
  outletTransitionPending = true;
  assignVisibleKeepAliveSurface(null);
  emitWarmKeepAlive();
}

function onWarmKeepAlivePopstate(): void {
  applyWarmKeepAlivePopstateHref(currentWindowNavigationHref());
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

/** Chrome-only: notified on the next animation frame after a warm emit. */
export function subscribeWarmKeepAliveChrome(onChange: () => void): () => void {
  warmKeepAliveChromeListeners.add(onChange);
  return () => {
    warmKeepAliveChromeListeners.delete(onChange);
  };
}

export type WarmKeepAliveProductTabRef = {
  id: string;
  href: string;
};

/**
 * Whether a product-tab bookmark may replace an existing warm lastHref slot.
 * Never regress: warm selection ahead of chrome/product-tab state must win
 * (rapid Inbox A select → switch B → return A).
 */
function shouldAcceptProductTabHrefMirror(input: {
  tabId: string;
  incomingHref: string;
  existingHref: string | undefined;
  nextActiveTabId: string | null;
}): boolean {
  const { existingHref, incomingHref, tabId, nextActiveTabId } = input;
  if (existingHref == null) return true;
  if (existingHref === incomingHref) return true;
  const existing = resolveAppHref(existingHref);
  const incoming = resolveAppHref(incomingHref);
  // Tab left the warm surface entirely (e.g. Inbox → Settings in that tab).
  if (existing.surface !== incoming.surface) return true;
  // Inactive tabs: product bookmarks often lag warm remember — never clobber.
  if (tabId !== nextActiveTabId) return false;
  // Active tab: accept only when the address bar already matches the bookmark
  // (chrome/location caught up). If warm still matches the live URL, keep warm.
  if (typeof window !== "undefined") {
    const live = currentWindowNavigationHref();
    const incomingLive =
      normalizeNavigationHref(incomingHref) === live;
    const existingLive =
      normalizeNavigationHref(existingHref) === live;
    if (incomingLive) return true;
    if (existingLive) return false;
  }
  // Tests / no window: prefer existing warm over a divergent product bookmark.
  return false;
}

/**
 * Mirror product-tab bookmarks into the warm store. Call whenever tabs change
 * and synchronously before navigate on activate/close so the first paint after
 * a tab switch reads that tab's selection — not a sibling tab's lastHref.
 *
 * Existing warm slots are authoritative when the product-tab href is stale.
 */
export function syncWarmKeepAliveProductTabs(input: {
  activeTabId: string;
  tabs: readonly WarmKeepAliveProductTabRef[];
}): void {
  const prevActive = activeProductTabId;
  const prevVisibleHref =
    visibleKeepAliveSurface != null
      ? lastHrefForKeepAliveSurface(visibleKeepAliveSurface)
      : null;

  const nextActive = input.activeTabId || null;
  const nextIds = new Set(input.tabs.map((tab) => tab.id));
  for (const id of [...lastHrefByTabId.keys()]) {
    if (!nextIds.has(id)) lastHrefByTabId.delete(id);
  }
  for (const tab of input.tabs) {
    const normalized = formatResolvedAppHref(resolveAppHref(tab.href));
    const existing = lastHrefByTabId.get(tab.id);
    if (
      !shouldAcceptProductTabHrefMirror({
        tabId: tab.id,
        incomingHref: normalized,
        existingHref: existing,
        nextActiveTabId: nextActive,
      })
    ) {
      continue;
    }
    lastHrefByTabId.set(tab.id, normalized);
  }
  if (nextActive !== prevActive) {
    warmNavGeneration += 1;
  }
  activeProductTabId = nextActive;

  const nextVisibleHref =
    visibleKeepAliveSurface != null
      ? lastHrefForKeepAliveSurface(visibleKeepAliveSurface)
      : null;
  if (
    visibleKeepAliveSurface != null &&
    nextVisibleHref != null &&
    nextVisibleHref !== prevVisibleHref
  ) {
    // Keep surface fallback aligned so short-circuit flips / popstate stay coherent.
    lastKeepAliveHref.set(visibleKeepAliveSurface, nextVisibleHref);
    emitWarmKeepAlive();
  }
}

/** Test/read helper — warm bookmark for a specific product tab (if any). */
export function lastHrefForProductTabId(tabId: string): string | null {
  return lastHrefByTabId.get(tabId) ?? null;
}

/**
 * Capture for async panel/data work. Stale owners must not navigate/remember
 * after the user switched tabs.
 */
export type WarmNavOwner = {
  tabId: string;
  generation: number;
};

export function captureWarmNavOwner(): WarmNavOwner | null {
  if (!activeProductTabId) return null;
  return {
    tabId: activeProductTabId,
    generation: warmNavGeneration,
  };
}

export function isWarmNavOwnerCurrent(owner: WarmNavOwner | null): boolean {
  if (owner == null) return activeProductTabId == null;
  return (
    owner.tabId === activeProductTabId &&
    isWarmNavGenerationCurrent(owner.generation)
  );
}

export function getWarmKeepAliveActiveProductTabId(): string | null {
  return activeProductTabId;
}

export function getWarmNavGeneration(): number {
  return warmNavGeneration;
}

export function isWarmNavGenerationCurrent(generation: number): boolean {
  return generation === warmNavGeneration;
}

export function lastHrefForKeepAliveSurface(
  surface: PendingPageSurface,
): string {
  if (activeProductTabId) {
    const tabHref = lastHrefByTabId.get(activeProductTabId);
    if (tabHref) {
      const resolved = resolveAppHref(tabHref);
      if (
        resolved.surface === surface &&
        shouldKeepAliveSurface(surface, resolved.pathname)
      ) {
        return formatResolvedAppHref(resolved);
      }
    }
  }
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
  options?: { generation?: number; tabId?: string; owner?: WarmNavOwner },
): void {
  const owner = options?.owner;
  const tabId = owner?.tabId ?? options?.tabId;
  const generation = owner?.generation ?? options?.generation;
  if (generation != null && !isWarmNavGenerationCurrent(generation)) {
    return;
  }
  if (
    tabId != null &&
    activeProductTabId != null &&
    tabId !== activeProductTabId
  ) {
    return;
  }
  const href = hrefFromParts(pathname, searchStr);
  lastKeepAliveHref.set(surface, href);
  const bindTabId = tabId ?? activeProductTabId;
  if (!bindTabId) return;
  // Only bind onto the claimed/active tab when it belongs to this surface
  // (or has no bookmark yet). Never write a sibling tab's slot.
  if (activeProductTabId && bindTabId !== activeProductTabId) return;
  const tabHref = lastHrefByTabId.get(bindTabId);
  if (tabHref) {
    const tabSurface = resolveAppHref(tabHref).surface;
    if (tabSurface !== surface) return;
  }
  lastHrefByTabId.set(
    bindTabId,
    formatResolvedAppHref(resolveAppHref(href)),
  );
}

/**
 * Inbox list stays mounted while viewing `/email/…?list=inbox`, but email is
 * not its own keep-alive surface. Mirror the email href onto the inbox pane
 * so selection + j/k stay on the open message instead of the previous task.
 */
export function rememberInboxPanelSelectionHref(
  href: string,
  owner?: WarmNavOwner | null,
): boolean {
  return rememberEmailListPanelSelectionHref(href, "inbox", owner);
}

/**
 * Communication list stays mounted while viewing `/email/…?list=communication`.
 */
export function rememberCommunicationPanelSelectionHref(
  href: string,
  owner?: WarmNavOwner | null,
): boolean {
  return rememberEmailListPanelSelectionHref(href, "communication", owner);
}

function rememberEmailListPanelSelectionHref(
  href: string,
  list: "inbox" | "communication",
  owner?: WarmNavOwner | null,
): boolean {
  if (owner && !isWarmNavOwnerCurrent(owner)) return false;
  if (!mountedKeepAliveSurfaces.has(list)) return false;
  const resolved = resolveAppHref(href);
  if (!resolved.pathname.startsWith("/email/")) return false;
  const params = new URLSearchParams(
    resolved.search.startsWith("?")
      ? resolved.search.slice(1)
      : resolved.search,
  );
  if (params.get("list") !== list) return false;
  const nextHref = formatResolvedAppHref(resolved);
  if (lastHrefForKeepAliveSurface(list) === nextHref) return false;
  rememberKeepAliveHref(list, resolved.pathname, resolved.search, {
    owner: owner ?? undefined,
  });
  // Callers often run from layout/nav; defer so we never notify React
  // subscribers synchronously inside another component's render.
  queueMicrotask(() => {
    emitWarmKeepAlive();
  });
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
 * item (e.g. Catalog) is a router no-op unless we dismiss and pushState.
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
  outletTransitionPending = true;

  // Push the address bar before emit so chrome re-renders see the destination
  // (trustedChromePath) — not the previous Inbox email URL.
  if (!shouldKeepAliveSurface(resolved.surface, resolved.pathname)) {
    followWarmKeepAliveUrl(formatResolvedAppHref(resolved));
  }
  emitWarmKeepAlive();
  return true;
}

/** True between dismiss() and the next syncVisibleKeepAliveSurfaceFromRoute. */
export function isKeepAliveOutletTransitionPending(): boolean {
  return outletTransitionPending;
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
  options?: { replace?: boolean; owner?: WarmNavOwner | null },
): boolean {
  if (options?.owner && !isWarmNavOwnerCurrent(options.owner)) {
    return false;
  }
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
  if (
    alreadyVisible &&
    lastHrefForKeepAliveSurface(resolved.surface) === nextHref
  ) {
    // Nothing changed for keep-alive consumers — skip the epoch fan-out.
    followWarmKeepAliveUrl(nextHref, replace);
    rememberSectionEntryFromNav(nextHref);
    return true;
  }
  rememberKeepAliveHref(resolved.surface, resolved.pathname, resolved.search, {
    owner: options?.owner ?? undefined,
  });
  assignVisibleKeepAliveSurface(resolved.surface);
  outletTransitionPending = false;
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

/**
 * Mirror TanStack/Outlet route onto the warm visible surface.
 * Preferred call site: `useLayoutEffect` in ShellRouteContent so assign+emit
 * land before paint. Clears outlet-transition pending from dismiss().
 */
export function syncVisibleKeepAliveSurfaceFromRoute(
  surface: PendingPageSurface | null,
): void {
  outletTransitionPending = false;
  if (!assignVisibleKeepAliveSurface(surface)) return;
  emitWarmKeepAlive();
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
  lastHrefByTabId.clear();
  activeProductTabId = null;
  warmNavGeneration = 0;
  visibleKeepAliveSurface = null;
  outletTransitionPending = false;
  warmKeepAliveEpoch = 0;
  warmKeepAlivePopstateInstalled = false;
}
