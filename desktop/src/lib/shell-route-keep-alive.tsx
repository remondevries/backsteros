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

import {
  getDefaultListKeyboardNavZone,
  ListKeyboardNavMountGate,
  useListKeyboardNavigationZone,
} from "@backsteros/ui";

import { type PendingPageSurface } from "./pending-navigation-routes";
import {
  getVisibleKeepAliveSurface,
  getWarmKeepAliveEpoch,
  lastHrefForKeepAliveSurface,
  listMountedKeepAliveSurfaces,
  markKeepAliveSurfaceMounted,
  partsFromKeepAliveHref,
  rememberKeepAliveHref,
  routerAgreesWithWindow,
  shouldKeepAliveSurface,
  subscribeWarmKeepAlive,
  visibleKeepAliveHref,
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
  get: () => { pathname: string; searchStr?: string; state?: unknown };
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

function locationWithState(
  live: { pathname: string; searchStr?: string; state?: unknown },
  routerState: unknown,
): {
  pathname: string;
  searchStr: string;
  state: unknown;
} {
  return {
    pathname: live.pathname,
    searchStr: live.searchStr ?? "",
    state: live.state ?? routerState,
  };
}

export {
  KEEP_ALIVE_SURFACES,
  dismissKeepAliveForOutletNavigation,
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
  rememberInboxPanelSelectionHref,
  resetKeepAliveForTests,
  resolveWarmKeepAliveHref,
  routerAgreesWithWindow,
  shouldKeepAliveSidePanelSurface,
  shouldKeepAliveSurface,
  syncVisibleKeepAliveSurfaceFromRoute,
  tryWarmKeepAliveFlip,
  visibleKeepAliveHref,
} from "./shell-warm-keep-alive";

export function useVisibleKeepAliveSurface(): PendingPageSurface | null {
  return useSyncExternalStore(
    subscribeWarmKeepAlive,
    getVisibleKeepAliveSurface,
    getVisibleKeepAliveSurface,
  );
}

/**
 * Changes on every warm emit (including same-surface href flips). Subscribe so
 * panes re-read lastHref when the visible surface string is unchanged.
 */
export function useWarmKeepAliveEpoch(): number {
  return useSyncExternalStore(
    subscribeWarmKeepAlive,
    getWarmKeepAliveEpoch,
    getWarmKeepAliveEpoch,
  );
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

/**
 * One location for chrome and keep-alive pages:
 * - Inside a KeepAlivePane → that pane's store href (snapshot)
 * - Else if a keep-alive surface is visible → visible surface store href
 * - Else (Outlet: finance, settings, email, development) → TanStack router
 */
export function useShellLocation() {
  const frozen = useContext(FrozenRouteContext);
  const visible = useVisibleKeepAliveSurface();
  useWarmKeepAliveEpoch();
  const router = useRouter();
  const skipLive = frozen != null || visible != null;
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
  const routerState = router.state.location.state;
  if (frozen) {
    return locationWithState(
      {
        pathname: frozen.snapshot.pathname,
        searchStr: frozen.snapshot.searchStr,
        state: live.state,
      },
      routerState,
    );
  }
  if (visible != null) {
    const warmHref = visibleKeepAliveHref();
    if (warmHref != null) {
      const parts = partsFromKeepAliveHref(warmHref);
      return locationWithState(
        {
          pathname: parts.pathname,
          searchStr: parts.searchStr,
          state: live.state,
        },
        routerState,
      );
    }
  }
  return locationWithState(live, routerState);
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
  if (surface === "journal-day") {
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
  if (surface === "letters") {
    params.slug = parts[1];
  }
  if (surface === "tasks-list" && parts[0] === "tasks") {
    if (parts.length >= 3) {
      params.dueFilter = parts[1];
      params.taskSlug = parts[2];
    } else if (parts.length === 2) {
      params.taskId = parts[1];
    }
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
  // Same-surface task/list href flips emit without changing `visible`.
  useWarmKeepAliveEpoch();
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

  const { setActiveZone } = useListKeyboardNavigationZone();
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    // Only reclaim j/k when this pane becomes visible — not on every
    // same-surface href flip (journal day → day would re-scroll the list).
    if (!becameActive) return;
    const preferredZone = getDefaultListKeyboardNavZone(nextSnapshot.pathname);
    const frame = requestAnimationFrame(() => {
      setActiveZone(preferredZone, {
        preferSidepanelForJk: preferredZone === "sidepanel",
        activate: true,
        landAtStart: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, nextSnapshot.pathname, setActiveZone]);

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
        <ListKeyboardNavMountGate active={active}>
          {children}
        </ListKeyboardNavMountGate>
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
    () => new Set(listMountedKeepAliveSurfaces()),
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
    // Only write the store from the router when History matches — after a
    // warm pushState the router is stale and must not clobber lastHref.
    if (routerAgreesWithWindow(pathname, searchStr)) {
      rememberKeepAliveHref(surface, pathname, searchStr);
    }
    const parts = partsFromKeepAliveHref(lastHrefForKeepAliveSurface(surface));
    const next = snapshotFor(surface, parts.pathname, parts.searchStr);
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
