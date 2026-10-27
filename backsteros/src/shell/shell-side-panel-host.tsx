import {
  Suspense,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  ResizableContextPanel,
  getContentSidePanelWidthKey,
} from "@backsteros/ui/shell";
import { resolveInboxSidebarIndicatorTone } from "@backsteros/ui/inbox";

import { useInboxListSessionState } from "../lib/inbox/inbox-list-session-context";
import { useDesktopWorkspaceInboxItems } from "../lib/workspace-data";
import { useShellSidePanel } from "./use-shell-side-panel";
import {
  isKeepAliveLeftSidePanelDest,
  resolveLeftSidePanelDest,
  resolveSidePanelTree,
} from "./shell-keep-alive-side-panels";
import {
  KeepAlivePane,
  StableKeepAliveTree,
  lastHrefForKeepAliveSurface,
  markKeepAliveSurfaceMounted,
  partsFromKeepAliveHref,
  snapshotFor,
  useVisibleKeepAliveSurface,
  type RouteSnapshot,
} from "../lib/shell-route-keep-alive";
import {
  currentWindowNavigationHref,
  parseNavigationPathname,
  type PendingPageSurface,
} from "../lib/pending-navigation-routes";

/**
 * One host path for the left list.
 *
 * ProductContentShell owns in-flow vs absolute-hide via `showSidePanel`.
 * This host supplies the panel body; the only extra park is finance (live
 * remount must not share the flex slot with the warm keep-alive stack).
 */
export function useShellSidePanelHost({
  composeOpen: _composeOpen,
  sidePanelCollapsed,
  sidePanelAnimating,
  setSidePanelCollapsed,
  onNavigate,
}: {
  composeOpen: boolean;
  sidePanelCollapsed: boolean;
  sidePanelAnimating: boolean;
  setSidePanelCollapsed: Dispatch<SetStateAction<boolean>>;
  onNavigate: (href: string) => void;
}) {
  const panel = useShellSidePanel();
  const {
    panelPathname,
    panelSearch,
    inInboxPanel,
    inCommunicationPanel,
    showSidePanel: showSidePanelFromLocation,
    financeSection,
  } = panel;

  // Sync — updates the same frame as main content on warm tab flips.
  const visibleSurface = useVisibleKeepAliveSurface();

  const dest = resolveLeftSidePanelDest({
    pathname: panelPathname,
    search: panelSearch,
    // Email Outlet (`?list=inbox`) — visibleSurface is null; pathname flags it.
    inInboxPanel,
    inCommunicationPanel,
    financeSection,
    showSidePanel: showSidePanelFromLocation,
    visibleSurface,
  });
  const currentKeepSurface = isKeepAliveLeftSidePanelDest(dest) ? dest : null;
  // Dest is the single source of truth for “is the list column open?”
  const showSidePanel = dest != null;

  const cachedKeepAlivePanels = useRef(
    new Map<PendingPageSurface, ReactNode>(),
  );
  const keepAlivePanelSnapshots = useRef(
    new Map<PendingPageSurface, RouteSnapshot>(),
  );
  const lastKeepAliveWidthKey = useRef(
    getContentSidePanelWidthKey("/calendar"),
  );
  const [visitedKeepAlivePanels, setVisitedKeepAlivePanels] = useState(
    () => new Set<PendingPageSurface>(),
  );

  const inboxItems = useDesktopWorkspaceInboxItems();
  // Keep pins while the inbox keep-alive list stays mounted — clearing on every
  // section flip wiped pins even though the list was only frozen.
  const inboxSessionActive =
    dest === "inbox" ||
    inInboxPanel ||
    visitedKeepAlivePanels.has("inbox");
  const { sessionContextValue } = useInboxListSessionState(inboxSessionActive);
  const inboxSidebarIndicator = useMemo(
    () => resolveInboxSidebarIndicatorTone(inboxItems),
    [inboxItems],
  );

  let visibleKeepAlivePanels = visitedKeepAlivePanels;
  if (currentKeepSurface) {
    markKeepAliveSurfaceMounted(currentKeepSurface);
    // Prefer warm lastHref — chrome pathname can briefly lag after a tab flip.
    const hrefParts = partsFromKeepAliveHref(
      lastHrefForKeepAliveSurface(currentKeepSurface),
    );
    const nextSnap = snapshotFor(
      currentKeepSurface,
      hrefParts.pathname,
      hrefParts.searchStr,
    );
    const prevSnap = keepAlivePanelSnapshots.current.get(currentKeepSurface);
    if (
      !prevSnap ||
      prevSnap.pathname !== nextSnap.pathname ||
      prevSnap.searchStr !== nextSnap.searchStr
    ) {
      keepAlivePanelSnapshots.current.set(currentKeepSurface, nextSnap);
    }
    const tree = resolveSidePanelTree(currentKeepSurface, onNavigate, {
      pathname: hrefParts.pathname,
    });
    if (tree != null && !cachedKeepAlivePanels.current.has(currentKeepSurface)) {
      cachedKeepAlivePanels.current.set(
        currentKeepSurface,
        <Suspense fallback={null}>{tree}</Suspense>,
      );
    }
    if (tree != null) {
      if (!visitedKeepAlivePanels.has(currentKeepSurface)) {
        const nextVisited = new Set(visitedKeepAlivePanels);
        nextVisited.add(currentKeepSurface);
        setVisitedKeepAlivePanels(nextVisited);
        visibleKeepAlivePanels = nextVisited;
      }
      lastKeepAliveWidthKey.current = getContentSidePanelWidthKey(
        hrefParts.pathname,
        hrefParts.searchStr,
      );
    }
  }

  const keepAliveStack =
    visibleKeepAlivePanels.size > 0 ? (
      <div className="keep-alive-stack relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {Array.from(visibleKeepAlivePanels).map((surface) => {
          const tree = cachedKeepAlivePanels.current.get(surface);
          const snapshot = keepAlivePanelSnapshots.current.get(surface);
          if (!tree || !snapshot) return null;
          return (
            <KeepAlivePane
              key={surface}
              surface={surface}
              role="sidepanel"
              active={surface === currentKeepSurface}
              snapshot={snapshot}
            >
              <StableKeepAliveTree tree={tree} />
            </KeepAlivePane>
          );
        })}
      </div>
    ) : null;

  // Dest can be finance from trusted chrome while TanStack still reports the
  // previous section — use the address bar for the live finance tree/rail.
  const financePathname =
    dest === "finance"
      ? parseNavigationPathname(currentWindowNavigationHref()) || panelPathname
      : panelPathname;

  const financeBody =
    dest === "finance" ? (
      <Suspense fallback={null}>
        {resolveSidePanelTree("finance", onNavigate, {
          pathname: financePathname,
          sidePanelCollapsed,
          setSidePanelCollapsed,
        })}
      </Suspense>
    ) : null;

  const financeRail = Boolean(
    dest === "finance" && sidePanelCollapsed && financeBody,
  );

  // Finance remounts live — park the keep-alive stack absolutely so it does
  // not share the in-flow flex slot with a second ResizableContextPanel.
  // For warm dests / Communication (no panel), ProductContentShell alone
  // parks the whole `sidePanel` tree via showSidePanel.
  const keepAlivePanel =
    keepAliveStack == null ? null : (
      <ResizableContextPanel
        key="keep-alive-side-panel-chrome"
        storageKey={lastKeepAliveWidthKey.current}
        collapsed={
          dest !== "finance" && showSidePanel && !financeRail
            ? sidePanelCollapsed
            : false
        }
        animating={
          dest !== "finance" && showSidePanel && !financeRail
            ? sidePanelAnimating
            : false
        }
      >
        {keepAliveStack}
      </ResizableContextPanel>
    );

  const keepAliveChrome =
    keepAlivePanel == null
      ? null
      : dest === "finance" ? (
          <div
            className="pointer-events-none invisible absolute inset-0 overflow-hidden"
            inert
            aria-hidden
          >
            {keepAlivePanel}
          </div>
        ) : (
          keepAlivePanel
        );

  const liveChrome = financeBody ? (
    financeRail ? (
      <aside className="context-panel context-panel--rail">{financeBody}</aside>
    ) : (
      <ResizableContextPanel
        storageKey={getContentSidePanelWidthKey(financePathname)}
      >
        {financeBody}
      </ResizableContextPanel>
    )
  ) : null;

  const sidePanel =
    keepAliveChrome || liveChrome ? (
      <>
        {keepAliveChrome}
        {liveChrome}
      </>
    ) : undefined;

  return {
    sidePanel,
    financeRail,
    inboxSidebarIndicator,
    showSidePanel,
    panelPathname,
    sessionContextValue,
    inboxModelActive: dest === "inbox" || inInboxPanel,
  };
}
