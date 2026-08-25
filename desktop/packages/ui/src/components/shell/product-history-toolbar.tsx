"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  SidebarChevronIcon,
  SidebarHistoryClockIcon,
} from "./sidebar-nav-icons.js";
import type { ProductSidebarRecentPage } from "./product-sidebar.js";

export type ProductHistoryToolbarProps = {
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  recentPages?: ProductSidebarRecentPage[];
  onSelectRecentPage?: (href: string) => void;
  className?: string;
};

function HistoryButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="app-side-panel-history-button"
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Recent / back / forward controls — lives in the sidebar when expanded, and
 * moves into the content tabs chrome when the sidebar is collapsed.
 */
export function ProductHistoryToolbar({
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
  recentPages = [],
  onSelectRecentPage,
  className,
}: ProductHistoryToolbarProps) {
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!historyMenuRef.current?.contains(event.target as Node)) {
        setHistoryMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [historyMenuOpen]);

  return (
    <div
      className={["app-side-panel-history-toolbar", className]
        .filter(Boolean)
        .join(" ")}
      data-tauri-drag-region
      ref={historyMenuRef}
    >
      <div className="app-side-panel-history-actions">
        <div className="app-side-panel-history-recent">
          <HistoryButton
            label="Recent pages"
            disabled={recentPages.length === 0 && !onSelectRecentPage}
            onClick={() => setHistoryMenuOpen((open) => !open)}
          >
            <SidebarHistoryClockIcon />
          </HistoryButton>

          {historyMenuOpen ? (
            <div
              className="app-side-panel-history-menu"
              role="menu"
              aria-label="Recent pages"
            >
              {recentPages.length === 0 ? (
                <p className="app-side-panel-history-empty">
                  No recent pages yet
                </p>
              ) : (
                recentPages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className="app-side-panel-history-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setHistoryMenuOpen(false);
                      onSelectRecentPage?.(page.href);
                    }}
                  >
                    <span className="app-side-panel-history-menu-badge">
                      {page.badge ?? "Page"}
                    </span>
                    <span className="app-side-panel-history-menu-content">
                      {page.icon ? (
                        <span
                          className="app-side-panel-history-entry-icon"
                          aria-hidden="true"
                        >
                          {page.icon}
                        </span>
                      ) : null}
                      <span className="app-side-panel-history-menu-title">
                        {page.title}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <HistoryButton
          label="Go back"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <SidebarChevronIcon pointing="left" />
        </HistoryButton>
        <HistoryButton
          label="Go forward"
          disabled={!canGoForward}
          onClick={onForward}
        >
          <SidebarChevronIcon pointing="right" />
        </HistoryButton>
      </div>
    </div>
  );
}
