import {
  Suspense,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  ResizableContextPanel,
  getContentSidePanelWidthKey,
} from "@backsteros/ui/shell";
import { resolveInboxSidebarIndicator } from "@backsteros/ui/inbox";

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
  snapshotFor,
  type RouteSnapshot,
} from "../lib/shell-route-keep-alive";
import type { PendingPageSurface } from "../lib/pending-navigation-routes";

/**
 * One host path for the left list.
 * Warm dests stay mounted-hidden; finance remounts on purpose.
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
    showSidePanel,
    financeSection,
  } = panel;

  const dest = resolveLeftSidePanelDest({
    pathname: panelPathname,
    search: panelSearch,
    inInboxPanel,
    financeSection,
    showSidePanel,
  });
  const currentKeepSurface = isKeepAliveLeftSidePanelDest(dest) ? dest : null;

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
  const { sessionContextValue } = useInboxListSessionState(inInboxPanel);
  const inboxSidebarIndicator = useMemo(
    () => resolveInboxSidebarIndicator(inboxItems),
    [inboxItems],
  );

  let visibleKeepAlivePanels = visitedKeepAlivePanels;
  if (currentKeepSurface) {
    const nextSnap = snapshotFor(
      currentKeepSurface,
      panelPathname,
      panelSearch,
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
      pathname: panelPathname,
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
      lastKeepAliveWidthKey.current =
        getContentSidePanelWidthKey(panelPathname);
    }
  }

  const keepAliveActive = currentKeepSurface != null;
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
              active={surface === currentKeepSurface}
              snapshot={snapshot}
            >
              <StableKeepAliveTree tree={tree} />
            </KeepAlivePane>
          );
        })}
      </div>
    ) : null;

  const financeBody =
    dest === "finance" ? (
      <Suspense fallback={null}>
        {resolveSidePanelTree("finance", onNavigate, {
          pathname: panelPathname,
          sidePanelCollapsed,
          setSidePanelCollapsed,
        })}
      </Suspense>
    ) : null;

  const financeRail = Boolean(
    financeSection && sidePanelCollapsed && financeBody,
  );

  // Warm stack stays in the tree when visiting finance/settings/tasks so
  // return visits do not remount. CSS hide only — never swap out for live.
  const keepHiddenStyle = {
    contentVisibility: "hidden",
  } as CSSProperties;
  const keepAliveChrome =
    keepAliveStack != null ? (
      <div
        className={
          keepAliveActive
            ? "contents"
            : "pointer-events-none invisible absolute inset-0 overflow-hidden"
        }
        {...(!keepAliveActive ? { inert: true } : {})}
        style={keepAliveActive ? undefined : keepHiddenStyle}
      >
        <ResizableContextPanel
          key="keep-alive-side-panel-chrome"
          storageKey={lastKeepAliveWidthKey.current}
          collapsed={keepAliveActive && sidePanelCollapsed}
          animating={keepAliveActive && sidePanelAnimating}
        >
          {keepAliveStack}
        </ResizableContextPanel>
      </div>
    ) : null;

  const liveChrome = financeBody ? (
    financeRail ? (
      <aside className="context-panel context-panel--rail">{financeBody}</aside>
    ) : (
      <ResizableContextPanel
        storageKey={getContentSidePanelWidthKey(panelPathname)}
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
  };
}
