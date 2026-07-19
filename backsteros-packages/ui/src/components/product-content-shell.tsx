"use client";

import type { ReactNode } from "react";

import {
  ProductContentTabs,
  type ProductContentTabsProps,
} from "./product-content-tabs.js";

export type ProductContentShellProps = ProductContentTabsProps & {
  children: ReactNode;
  /** Optional left context panel (inbox lists, settings nav, etc.). */
  sidePanel?: ReactNode;
  showSidePanel?: boolean;
  /** Optional breadcrumb / chrome row above page scroll. */
  chromeHeader?: ReactNode;
};

/**
 * Workspace content shell — tabs bar + bordered content frame.
 * Matches `backsteros-app` section.workspace / ContentFrame structure.
 */
export function ProductContentShell({
  children,
  sidePanel,
  showSidePanel = false,
  chromeHeader,
  ...tabsProps
}: ProductContentShellProps) {
  const showSidePanelSlot = Boolean(showSidePanel && sidePanel);

  return (
    <section className="workspace">
      <ProductContentTabs {...tabsProps} />
      <div
        className={`content-frame${showSidePanelSlot ? " content-frame-with-side" : " content-frame-main-only"}`}
      >
        {showSidePanelSlot ? sidePanel : null}
        <main className="main-slot">
          {chromeHeader}
          <div className="page-scroll">{children}</div>
        </main>
      </div>
    </section>
  );
}
