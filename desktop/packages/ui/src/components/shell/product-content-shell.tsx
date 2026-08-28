"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  ProductContentTabs,
  type ProductContentTabsProps,
} from "./product-content-tabs.js";

export type ProductContentShellProps = ProductContentTabsProps & {
  children: ReactNode;
  /** Optional left context panel (inbox lists, settings nav, etc.). */
  sidePanel?: ReactNode;
  /**
   * When true, the route owns a left list panel. Panel stays in the flex
   * layout even while collapsed so width can animate open/closed.
   */
  showSidePanel?: boolean;
  /** User-collapsed via ⇧[ — width animates to 0 when set. */
  sidePanelCollapsed?: boolean;
  /** True while the left panel width is interpolating. */
  sidePanelAnimating?: boolean;
  /** Optional breadcrumb / chrome row above page scroll. */
  chromeHeader?: ReactNode;
  /** Optional bottom status bar under the content column. */
  statusBar?: ReactNode;
};

const HIDDEN_SIDE_PANEL_STYLE = {
  contentVisibility: "hidden",
} as CSSProperties;

/**
 * Workspace content shell — tabs bar + bordered content frame.
 *
 * Left list collapse animates `.context-panel` width (see ResizableContextPanel).
 * The in-flow slot is a real flex item — not `display: contents` — so WKWebView
 * updates layout during the slide.
 *
 * Route-level hide (no panel for this page) still uses the absolute keep-alive
 * box so warm stacks survive navigation.
 */
export function ProductContentShell({
  children,
  sidePanel,
  showSidePanel = false,
  sidePanelCollapsed = false,
  sidePanelAnimating = false,
  chromeHeader,
  statusBar,
  ...tabsProps
}: ProductContentShellProps) {
  const panelInFlow = Boolean(showSidePanel && sidePanel);
  const panelKeepAliveHidden = Boolean(sidePanel) && !panelInFlow;

  return (
    <section className="workspace">
      <ProductContentTabs {...tabsProps} />
      <div
        className={[
          "content-frame",
          panelInFlow ? "content-frame-with-side" : "content-frame-main-only",
          panelInFlow && sidePanelCollapsed ? "is-side-panel-collapsed" : null,
          panelInFlow && sidePanelAnimating ? "is-side-panel-animating" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-side-panel-collapsed={
          panelInFlow && sidePanelCollapsed ? "true" : "false"
        }
      >
        {sidePanel != null ? (
          <div
            className={
              panelInFlow
                ? "content-side-panel-slot"
                : "pointer-events-none invisible absolute inset-0 overflow-hidden"
            }
            {...(panelKeepAliveHidden
              ? { inert: true, "aria-hidden": true }
              : {})}
            style={panelKeepAliveHidden ? HIDDEN_SIDE_PANEL_STYLE : undefined}
          >
            {sidePanel}
          </div>
        ) : null}
        <main className="main-slot">
          {chromeHeader}
          <div className="page-scroll">{children}</div>
        </main>
      </div>
      {statusBar}
    </section>
  );
}
