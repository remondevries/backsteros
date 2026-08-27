import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

import type { PendingPageSurface } from "./pending-navigation-routes";
import {
  KEEP_ALIVE_SURFACES,
  chromeHrefForWarmKeepAlive,
  getVisibleKeepAliveSurface,
  lastHrefForKeepAliveSurface,
  markKeepAliveSurfaceMounted,
  partsFromKeepAliveHref,
  rememberKeepAliveHref,
  shouldKeepAliveSurface,
  subscribeWarmKeepAlive,
} from "./shell-warm-keep-alive";

export type RouteSnapshot = {
  pathname: string;
  searchStr: string;
  params: Record<string, string | undefined>;
};

type FrozenRouteContextValue = {
  active: boolean;
  snapshot: RouteSnapshot;
  allowHeavy: boolean;
};

const FrozenRouteContext = createContext<FrozenRouteContextValue | null>(null);

type LocationStore = {
  subscribe: (listener: () => void) => unknown;
  get: () => { pathname: string; searchStr?: string };
};

function routerLocationStore(router: {
  stores?: { location?: LocationStore };
}): LocationStore | null {
  return router.stores?.location ?? null;
}

/** TanStack atom.subscribe returns `{ unsubscribe }`, not a function. */
function unsubscribeFromStore(subscription: unknown): () => void {
  if (typeof subscription === "function") return subscription;
  if (
    subscription &&
    typeof subscription === "object" &&
    "unsubscribe" in subscription &&
    typeof subscription.unsubscribe === "function"
  ) {
    return () => subscription.unsubscribe();
  }
  return () => {};
}

export {
  KEEP_ALIVE_SURFACES,
  chromeHrefForWarmKeepAlive,
  getVisibleKeepAliveSurface,
  isKeepAlivePaneMounted,
  isKeepAliveSurface,
  isWarmKeepAliveSectionFlip,
  keepAliveDestinationShowsSidePanel,
  keepAliveSidePanelSurface,
  lastHrefForKeepAliveSurface,
  markKeepAliveSurfaceMounted,
  partsFromKeepAliveHref,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
  resolveWarmKeepAliveHref,
  shouldApplyRouteKeepAliveSync,
  shouldKeepAliveSidePanelSurface,
  shouldKeepAliveSurface,
  syncVisibleKeepAliveSurfaceFromRoute,
  tryWarmKeepAliveFlip,
} from "./shell-warm-keep-alive";

export function useVisibleKeepAliveSurface(): PendingPageSurface | null {
  return useSyncExternalStore(
    subscribeWarmKeepAlive,
    getVisibleKeepAliveSurface,
    getVisibleKeepAliveSurface,
  );
}

/**
 * Sidebar / tabs / side-panel host location. Follows the keep-alive store
 * on a warm hop; uses the router when it matches or when showing Outlet.
 */
export function useChromeShellLocation() {
  const visible = useVisibleKeepAliveSurface();
  const location = useLocation();
  if (visible == null) {
    return {
      pathname: location.pathname,
      searchStr: location.searchStr ?? "",
      state: location.state,
    };
  }
  const warmHref = chromeHrefForWarmKeepAlive();
  if (warmHref == null) {
    return {
      pathname: location.pathname,
      searchStr: location.searchStr ?? "",
      state: location.state,
    };
  }
  const parts = partsFromKeepAliveHref(warmHref);
  return {
    pathname: parts.pathname,
    searchStr: parts.searchStr,
    state: location.state,
  };
}

export function useKeepAliveActive(): boolean {
  return useContext(FrozenRouteContext)?.active ?? true;
}

export function useKeepAlivePageVisible(): boolean {
  return useKeepAliveActive();
}

export function useKeepAliveFrozen(): boolean {
  const ctx = useContext(FrozenRouteContext);
  return ctx != null && !ctx.active;
}

/** True after this pane's list chrome has painted. Never resets on hide. */
export function useKeepAliveAfterPaint(): boolean {
  return useContext(FrozenRouteContext)?.allowHeavy ?? true;
}

/** Location for a keep-alive page — always the pane snapshot, not the router. */
export function useShellLocation() {
  const frozen = useContext(FrozenRouteContext);
  const router = useRouter();
  const skipLive = frozen != null;
  const store = routerLocationStore(router);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (skipLive || !store) return () => {};
      return unsubscribeFromStore(store.subscribe(onChange));
    },
    [skipLive, store],
  );
  const live = useSyncExternalStore(
    subscribe,
    () => store?.get() ?? router.state.location,
    () => store?.get() ?? router.state.location,
  );
  if (frozen) {
    return {
      ...live,
      pathname: frozen.snapshot.pathname,
      searchStr: frozen.snapshot.searchStr,
    };
  }
  return live;
}

/** Params for a keep-alive page — frozen while the pane is hidden. */
export function useShellParams() {
  const frozen = useContext(FrozenRouteContext);
  const router = useRouter();
  const skipLive = frozen != null;
  const store = routerLocationStore(router);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (skipLive || !store) return () => {};
      return unsubscribeFromStore(store.subscribe(onChange));
    },
    [skipLive, store],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      frozen
        ? frozen.snapshot.params
        : ((router.state.matches.at(-1)?.params ?? {}) as Record<
            string,
            string | undefined
          >),
    () =>
      frozen
        ? frozen.snapshot.params
        : ((router.state.matches.at(-1)?.params ?? {}) as Record<
            string,
            string | undefined
          >),
  );
}

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

export function useRoutePathActive(root: string): boolean {
  const { pathname } = useLocation();
  return isRoutePathActive(pathname, root);
}

export function snapshotFor(
  surface: PendingPageSurface,
  pathname: string,
  searchStr: string,
): RouteSnapshot {
  const parts = pathname.split("/").filter(Boolean);
  const params: Record<string, string | undefined> = {};
  if (surface === "inbox") {
    params.itemId = parts[0] === "inbox" ? parts[1] : undefined;
  }
  if (surface === "journal-habits") {
    params.habitId = parts[2];
  }
  if (surface === "habits-v2") {
    params.habitId = parts[1];
  }
  if (surface === "journal-day") {
    params.dateSlug = parts[1];
  }
  if (surface === "journal-v2") {
    params.dateSlug = parts[1];
  }
  if (surface === "projects" || surface === "contacts") {
    params.slug = parts[1];
    params.section = parts[2];
  }
  if (surface === "organizations") {
    params.slug = parts[1];
    params.section = parts[2];
  }
  if (surface === "letters" || surface === "letters-v2") {
    params.slug = parts[1];
  }
  return { pathname, searchStr, params };
}

function snapshotsMatch(left: RouteSnapshot, right: RouteSnapshot): boolean {
  return left.pathname === right.pathname && left.searchStr === right.searchStr;
}

export const KeepAlivePane = memo(function KeepAlivePane({
  surface,
  active: activeProp,
  snapshot,
  children,
}: {
  surface?: PendingPageSurface;
  active: boolean;
  snapshot: RouteSnapshot;
  children: ReactNode;
}) {
  const visible = useVisibleKeepAliveSurface();
  const active =
    surface != null && visible != null ? visible === surface : activeProp;
  let nextSnapshot = snapshot;
  if (surface != null) {
    const parts = partsFromKeepAliveHref(lastHrefForKeepAliveSurface(surface));
    nextSnapshot = snapshotFor(surface, parts.pathname, parts.searchStr);
  }
  const [allowHeavy, setAllowHeavy] = useState(false);
  useEffect(() => {
    if (!active || allowHeavy) return;
    const frame = requestAnimationFrame(() => setAllowHeavy(true));
    return () => cancelAnimationFrame(frame);
  }, [active, allowHeavy]);

  const valueRef = useRef<FrozenRouteContextValue>({
    active,
    snapshot: nextSnapshot,
    allowHeavy,
  });
  if (
    valueRef.current.active !== active ||
    !snapshotsMatch(valueRef.current.snapshot, nextSnapshot) ||
    valueRef.current.allowHeavy !== allowHeavy
  ) {
    valueRef.current = { active, snapshot: nextSnapshot, allowHeavy };
  }

  return (
    <FrozenRouteContext.Provider value={valueRef.current}>
      <div
        className="keep-alive-pane"
        data-keep-alive-hidden={active ? undefined : ""}
        inert={!active ? true : undefined}
        aria-hidden={!active}
      >
        {children}
      </div>
    </FrozenRouteContext.Provider>
  );
});

/** Same element ref → memo skips, so a hidden tree does not re-render. */
export const StableKeepAliveTree = memo(function StableKeepAliveTree({
  tree,
}: {
  tree: ReactNode;
}) {
  return tree;
});

export function useVisitedKeepAliveSurfaces(
  surface: PendingPageSurface,
  pathname: string,
  trail: boolean,
): Set<PendingPageSurface> {
  const [visited, setVisited] = useState<ReadonlySet<PendingPageSurface>>(
    () => new Set(),
  );
  if (
    !trail &&
    shouldKeepAliveSurface(surface, pathname) &&
    !visited.has(surface)
  ) {
    const next = new Set(visited);
    next.add(surface);
    markKeepAliveSurfaceMounted(surface);
    setVisited(next);
    return next;
  }
  return visited as Set<PendingPageSurface>;
}

export function useKeepAliveSnapshots(
  surface: PendingPageSurface,
  pathname: string,
  searchStr: string,
): Map<PendingPageSurface, RouteSnapshot> {
  const snapshots = useRef(new Map<PendingPageSurface, RouteSnapshot>());
  if (shouldKeepAliveSurface(surface, pathname)) {
    rememberKeepAliveHref(surface, pathname, searchStr);
    const next = snapshotFor(surface, pathname, searchStr);
    const prev = snapshots.current.get(surface);
    if (!prev || !snapshotsMatch(prev, next)) {
      snapshots.current.set(surface, next);
    }
  }
  return snapshots.current;
}

/** Hide Outlet while a warm keep-alive surface is showing. */
export function KeepAliveOutletGate({
  showOutlet,
  children,
}: {
  showOutlet: boolean;
  children: ReactNode;
}) {
  const visible = useVisibleKeepAliveSurface();
  if (visible != null || !showOutlet) return null;
  return children;
}

/**
 * Stay `contents` on every keep-alive destination, including tasks /projects.
 * Those pages hide the column via `showSidePanel` + content-frame CSS so the
 * ResizableContextPanel is never remounted or pulled out of the frame.
 */
export function KeepAliveSidePanelFrame({ children }: { children: ReactNode }) {
  const visible = useVisibleKeepAliveSurface();
  const show = visible != null;
  return (
    <div
      className={
        show
          ? "contents"
          : "pointer-events-none invisible absolute inset-0 overflow-hidden"
      }
    >
      {children}
    </div>
  );
}

/** Drop live (finance) chrome while a keep-alive surface is visible. */
export function KeepAliveSidePanelSwitch({
  keepAliveChrome,
  liveChrome,
}: {
  keepAliveChrome: ReactNode;
  liveChrome: ReactNode;
}) {
  const visible = useVisibleKeepAliveSurface();
  if (visible != null) return keepAliveChrome;
  if (!keepAliveChrome && !liveChrome) return null;
  return (
    <>
      {keepAliveChrome}
      {liveChrome}
    </>
  );
}
