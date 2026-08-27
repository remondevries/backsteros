import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ResizableContextPanel,
  getContentSidePanelWidthKey,
} from "@backsteros/ui/shell";
import { resolveInboxSidebarIndicator } from "@backsteros/ui/inbox";

import { useInboxListSessionState } from "../lib/inbox/inbox-list-session-context";
import { useDesktopWorkspaceMeta } from "../lib/workspace-data";
import { useShellSidePanel } from "./use-shell-side-panel";
import { keepAliveSidePanelTree } from "./shell-keep-alive-side-panels";
import { LiveSidePanelBody } from "./shell-live-side-panel";
import {
  KeepAlivePane,
  KeepAliveSidePanelFrame,
  KeepAliveSidePanelSwitch,
  StableKeepAliveTree,
  keepAliveSidePanelSurface,
  snapshotFor,
  type RouteSnapshot,
} from "../lib/shell-route-keep-alive";
import type { PendingPageSurface } from "../lib/pending-navigation-routes";

export function useShellSidePanelHost({
  composeOpen: _composeOpen,
  sidePanelCollapsed,
  setSidePanelCollapsed,
  onNavigate,
}: {
  composeOpen: boolean;
  sidePanelCollapsed: boolean;
  setSidePanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  onNavigate: (href: string) => void;
}) {
  const panel = useShellSidePanel();
  const {
    panelPathname,
    panelSearch,
    inInboxPanel,
    showSidePanel,
    activeProject,
    projectRouteScope,
    financeSection,
  } = panel;
  const currentKeepSurface = keepAliveSidePanelSurface(panelPathname);
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

  const { inboxItems } = useDesktopWorkspaceMeta();
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
    const tree = keepAliveSidePanelTree(
      currentKeepSurface,
      onNavigate,
      panelPathname,
    );
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

  const needsLivePanel = showSidePanel && currentKeepSurface == null;
  const liveBody = needsLivePanel ? (
    <Suspense fallback={null}>
      <LiveSidePanelBody
        panelPathname={panelPathname}
        showSidePanel={showSidePanel}
        activeProject={activeProject}
        projectRouteScope={projectRouteScope}
        financeSection={financeSection}
        sidePanelCollapsed={sidePanelCollapsed}
        setSidePanelCollapsed={setSidePanelCollapsed}
        onNavigate={onNavigate}
      />
    </Suspense>
  ) : null;

  const financeRail = Boolean(financeSection && sidePanelCollapsed && liveBody);

  const keepAliveChrome =
    keepAliveStack != null ? (
      <KeepAliveSidePanelFrame>
        <ResizableContextPanel
          key="keep-alive-side-panel-chrome"
          storageKey={lastKeepAliveWidthKey.current}
        >
          {keepAliveStack}
        </ResizableContextPanel>
      </KeepAliveSidePanelFrame>
    ) : null;

  const liveChrome = liveBody ? (
    financeRail ? (
      <aside className="context-panel context-panel--rail">{liveBody}</aside>
    ) : (
      <ResizableContextPanel
        storageKey={getContentSidePanelWidthKey(panelPathname)}
      >
        {liveBody}
      </ResizableContextPanel>
    )
  ) : null;

  const sidePanel =
    keepAliveChrome || liveChrome ? (
      <KeepAliveSidePanelSwitch
        keepAliveChrome={keepAliveChrome}
        liveChrome={liveChrome}
      />
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
