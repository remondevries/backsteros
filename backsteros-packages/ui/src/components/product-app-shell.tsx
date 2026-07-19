"use client";

import type { ReactNode } from "react";

import {
  ProductContentShell,
  type ProductContentShellProps,
} from "./product-content-shell.js";

export type ProductAppShellProps = ProductContentShellProps & {
  /** Left nav (typically `<ProductSidebar … />`). */
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
  className?: string;
};

/**
 * Full product chrome: sidebar + content shell.
 * Same outer structure as `backsteros-app` `.app-shell`.
 */
export function ProductAppShell({
  sidebar,
  sidebarCollapsed = false,
  className = "",
  ...contentProps
}: ProductAppShellProps) {
  return (
    <div className={`bos-product-shell app-shell ${className}`.trim()}>
      <aside
        className={`desktop-sidebar bos-product-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
      >
        {sidebar}
      </aside>
      <ProductContentShell {...contentProps} />
    </div>
  );
}
