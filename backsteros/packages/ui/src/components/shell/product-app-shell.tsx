"use client";

import type { ReactNode } from "react";

import { ContentLayoutTransitionProvider } from "./content-layout-transition-context.js";
import {
  ProductChatPanel,
  type ProductChatPanelProps,
} from "./product-chat-panel.js";
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
  /**
   * Optional right chat column — frameless, on the window background
   * (mirrors the left nav). Mounted once at the shell so it survives
   * navigation.
   */
  chatPanel?: ReactNode;
  chatPanelCollapsed?: boolean;
  chatPanelAnimating?: boolean;
  chatPanelWidth?: number;
  onChatPanelWidthChange?: ProductChatPanelProps["onWidthChange"];
  className?: string;
};

/**
 * Full product chrome: sidebar + content shell + optional chat column.
 * Same outer structure as `backsteros-app` `.app-shell`.
 */
export function ProductAppShell({
  sidebar,
  sidebarCollapsed = false,
  sidebarAnimating = false,
  chatPanel = null,
  chatPanelCollapsed = false,
  chatPanelAnimating = false,
  chatPanelWidth,
  onChatPanelWidthChange,
  className = "",
  ...contentProps
}: ProductAppShellProps) {
  const chromeLayoutAnimating =
    sidebarAnimating ||
    chatPanelAnimating ||
    Boolean(contentProps.sidePanelAnimating);
  const showChatPanel = chatPanel != null;

  return (
    <div
      className={`bos-product-shell app-shell${
        sidebarCollapsed ? " is-sidebar-collapsed" : ""
      }${sidebarAnimating ? " is-sidebar-animating" : ""}${
        showChatPanel && chatPanelCollapsed ? " is-chat-panel-collapsed" : ""
      }${showChatPanel && chatPanelAnimating ? " is-chat-panel-animating" : ""}${
        className ? ` ${className}` : ""
      }`.trim()}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-sidebar-animating={sidebarAnimating ? "true" : "false"}
      data-chat-panel-collapsed={
        showChatPanel && chatPanelCollapsed ? "true" : "false"
      }
      data-chat-panel-animating={
        showChatPanel && chatPanelAnimating ? "true" : "false"
      }
    >
      {/*
        Zone behind native macOS traffic lights (left inset of the titlebar).
        AppKit still owns the real buttons; this strip starts a window drag so
        empty space around the lights moves the window — same as BacksterDESIGN.
      */}
      <div
        className="bos-chrome-traffic-lights"
        aria-hidden="true"
        data-tauri-drag-region="deep"
      />
      <aside
        className={`desktop-sidebar bos-product-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
      >
        {sidebar}
      </aside>
      <ContentLayoutTransitionProvider animating={chromeLayoutAnimating}>
        <ProductContentShell {...contentProps} />
      </ContentLayoutTransitionProvider>
      {showChatPanel ? (
        <ProductChatPanel
          collapsed={chatPanelCollapsed}
          animating={chatPanelAnimating}
          width={chatPanelWidth}
          onWidthChange={onChatPanelWidthChange}
        >
          {chatPanel}
        </ProductChatPanel>
      ) : null}
      <OverlayScrollbarRoot />
    </div>
  );
}
