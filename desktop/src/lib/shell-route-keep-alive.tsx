import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
  subscribeWarmKeepAliveChrome,
  visibleKeepAliveHref,
} from "./shell-warm-keep-alive";
import {
  snapshotFor,
  type RouteSnapshot,
} from "./shell-keep-alive-snapshot";

export type { RouteSnapshot } from "./shell-keep-alive-snapshot";
export { snapshotFor } from "./shell-keep-alive-snapshot";

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

/**
 * `RouterWritableStore` only declares `get`/`set`; on the client TanStack
 * backs it with a react-store atom that also exposes `subscribe`.
 */
type RouterLocationStoreLike = {
  get: LocationStore["get"];
  subscribe?: LocationStore["subscribe"];
};

function isSubscribableStore(
  store: RouterLocationStoreLike,
): store is LocationStore {
  return typeof store.subscribe === "function";
}

function routerLocationStore(router: {
  stores?: { location?: RouterLocationStoreLike };
}): LocationStore | null {
  const location = router.stores?.location;
  return location && isSubscribableStore(location) ? location : null;
}

/** TanStack atom.subscribe returns `{ unsubscribe }`, not a function. */
function unsubscribeFromStore(subscription: unknown): () => void {
  if (typeof subscription === "function") return () => void subscription();
  if (
    subscription &&
    typeof subscription === "object" &&
    "unsubscribe" in subscription
  ) {
    const unsubscribe: unknown = subscription.unsubscribe;
    if (typeof unsubscribe === "function") {
      return () => void unsubscribe.call(subscription);
    }
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
 *
 * Keep-alive page bodies must not subscribe to the warm epoch: every section
 * flip would re-render every frozen tree. Location updates arrive via
 * FrozenRouteContext from KeepAlivePane instead.
 */
export function useShellLocation() {
  const frozen = useContext(FrozenRouteContext);
  const skipWarm = frozen != null;
  // Chrome only needs one warm subscription — epoch bumps on every emit
  // (including visible changes). Subscribing to visible + epoch doubled
  // re-renders per flip (~20–70 chrome wakes in perf logs).
  // Chrome notifications are deferred to the next frame so pane DOM can paint.
  const subscribeWarm = useCallback(
    (onChange: () => void) => {
      if (skipWarm) return () => {};
      return subscribeWarmKeepAliveChrome(onChange);
    },
    [skipWarm],
  );
  useSyncExternalStore(
    subscribeWarm,
    getWarmKeepAliveEpoch,
    getWarmKeepAliveEpoch,
  );
  const visible = skipWarm ? null : getVisibleKeepAliveSurface();
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

function snapshotsMatch(left: RouteSnapshot, right: RouteSnapshot): boolean {
  return left.pathname === right.pathname && left.searchStr === right.searchStr;
}

export const KeepAlivePane = memo(function KeepAlivePane({
  surface,
  active: activeProp,
  snapshot,
  /** Side panels thaw one frame later so the main page paints first. */
  role = "main",
  children,
}: {
  surface?: PendingPageSurface;
  active: boolean;
  snapshot: RouteSnapshot;
  role?: "main" | "sidepanel";
  children: ReactNode;
}) {
  // Only wake when THIS surface gains/loses keep-alive visibility — not when
  // other sections flip. Same-surface href flips leave `visible` unchanged and
  // use the epoch subscription below (shown panes only).
  const subscribeVisible = useCallback(
    (onChange: () => void) => {
      if (surface == null) return () => {};
      let wasMine = getVisibleKeepAliveSurface() === surface;
      return subscribeWarmKeepAlive(() => {
        const isMine = getVisibleKeepAliveSurface() === surface;
        if (isMine === wasMine) return;
        wasMine = isMine;
        onChange();
      });
    },
    [surface],
  );
  const isThisSurfaceShown = useCallback(() => {
    if (surface == null) return activeProp;
    const visible = getVisibleKeepAliveSurface();
    // First-visit / Outlet dismiss clears `visible` so the router-driven
    // activeProp can win on that commit (see dismissKeepAliveForOutletNavigation).
    if (visible == null) return activeProp;
    return visible === surface;
  }, [surface, activeProp]);
  const active = useSyncExternalStore(
    subscribeVisible,
    isThisSurfaceShown,
    isThisSurfaceShown,
  );
  const shown = active;
  // DOM visibility flips immediately. Thaw runs on the next animation frame
  // (urgent); freeze runs one frame later with a visibility guard so a stale
  // freeze cannot land after the user has already returned.
  const [treeActive, setTreeActive] = useState(() => shown);
  useLayoutEffect(() => {
    let cancelled = false;
    if (shown) {
      if (treeActive) {
        return () => {
          cancelled = true;
        };
      }
      const thaw = () => {
        if (cancelled) return;
        // Never activate a pane that is no longer the visible surface.
        if (surface != null && getVisibleKeepAliveSurface() !== surface) {
          return;
        }
        if (surface == null && !activeProp) return;
        setTreeActive(true);
      };
      // Main thaws next frame; sidepanel waits one more so main paints first.
      let frame2 = 0;
      const frame1 = requestAnimationFrame(() => {
        if (cancelled) return;
        if (role === "sidepanel") {
          frame2 = requestAnimationFrame(() => {
            if (!cancelled) thaw();
          });
          return;
        }
        thaw();
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame1);
        if (frame2) cancelAnimationFrame(frame2);
      };
    }
    if (!treeActive) return;
    // Freeze one frame later than main thaw so the entering pane activates
    // first. Skip if this surface is visible again (stale freeze guard).
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      if (surface != null && getVisibleKeepAliveSurface() === surface) return;
      if (surface == null && activeProp) return;
      setTreeActive(false);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [shown, treeActive, surface, activeProp, role]);
  // Context consumers must stay frozen while DOM-hidden, even if raw
  // treeActive briefly disagrees.
  const effectiveTreeActive = treeActive && shown;
  const subscribeEpoch = useCallback(
    (onChange: () => void) => {
      if (surface != null && !shown) return () => {};
      return subscribeWarmKeepAlive(onChange);
    },
    [surface, shown],
  );
  useSyncExternalStore(
    subscribeEpoch,
    getWarmKeepAliveEpoch,
    getWarmKeepAliveEpoch,
  );
  let nextSnapshot = snapshot;
  if (surface != null) {
    const parts = partsFromKeepAliveHref(lastHrefForKeepAliveSurface(surface));
    nextSnapshot = snapshotFor(surface, parts.pathname, parts.searchStr);
  }
  const [allowHeavy, setAllowHeavy] = useState(false);
  useEffect(() => {
    if (!effectiveTreeActive || allowHeavy) return;
    const frame = requestAnimationFrame(() => setAllowHeavy(true));
    return () => cancelAnimationFrame(frame);
  }, [effectiveTreeActive, allowHeavy]);

  const { setActiveZone } = useListKeyboardNavigationZone();
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = effectiveTreeActive && !wasActiveRef.current;
    wasActiveRef.current = effectiveTreeActive;
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
  }, [effectiveTreeActive, nextSnapshot.pathname, setActiveZone]);

  const valueRef = useRef<FrozenRouteContextValue>({
    active: effectiveTreeActive,
    snapshot: nextSnapshot,
    allowHeavy,
  });
  if (
    valueRef.current.active !== effectiveTreeActive ||
    !snapshotsMatch(valueRef.current.snapshot, nextSnapshot) ||
    valueRef.current.allowHeavy !== allowHeavy
  ) {
    valueRef.current = {
      active: effectiveTreeActive,
      snapshot: nextSnapshot,
      allowHeavy,
    };
  }

  return (
    <FrozenRouteContext.Provider value={valueRef.current}>
      <div
        className="keep-alive-pane"
        data-keep-alive-hidden={shown ? undefined : ""}
        inert={!shown ? true : undefined}
        aria-hidden={!shown}
      >
        <ListKeyboardNavMountGate active={effectiveTreeActive}>
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
