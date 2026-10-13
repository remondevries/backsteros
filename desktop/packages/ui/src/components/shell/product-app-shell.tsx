"use client";

import type { ReactNode } from "react";

import { ContentLayoutTransitionProvider } from "./content-layout-transition-context.js";
import {
  ProductContentShell,
  type ProductContentShellProps,
} from "./product-content-shell.js";
import { OverlayScrollbarRoot } from "./overlay-scrollbar-root.js";

export type ProductAppShellProps = ProductContentShellProps & {
  /** Left nav (typically `<ProductSidebar … />`). */
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
  /** True while the left nav width is interpolating open/closed. */
  sidebarAnimating?: boolean;
  className?: string;
};

/**
 * Full product chrome: sidebar + content shell.
 * Same outer structure as `backsteros-app` `.app-shell`.
 */
export function ProductAppShell({
  sidebar,
  sidebarCollapsed = false,
  sidebarAnimating = false,
  className = "",
  ...contentProps
}: ProductAppShellProps) {
  const chromeLayoutAnimating =
    sidebarAnimating || Boolean(contentProps.sidePanelAnimating);

  return (
    <div
      className={`bos-product-shell app-shell${
        sidebarCollapsed ? " is-sidebar-collapsed" : ""
      }${sidebarAnimating ? " is-sidebar-animating" : ""}${
        className ? ` ${className}` : ""
      }`.trim()}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-sidebar-animating={sidebarAnimating ? "true" : "false"}
    >
      <aside
        className={`desktop-sidebar bos-product-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
      >
        {sidebar}
      </aside>
      <ContentLayoutTransitionProvider animating={chromeLayoutAnimating}>
        <ProductContentShell {...contentProps} />
      </ContentLayoutTransitionProvider>
      <OverlayScrollbarRoot />
    </div>
  );
}
