"use client";

import { useEffect, useRef, useState } from "react";

import { HistoryEntryIcon } from "@/components/navigation/history-entry-icon";
import { useNavigationHistory } from "@/components/navigation/navigation-history-provider";
import {
  SidebarChevronIcon,
  SidebarHistoryClockIcon,
} from "@/components/shell/sidebar-nav-icons";
import { useBackendMode } from "@/lib/backend-mode-context";
import { backendModeLabel } from "@/lib/dev-backend-mode";
import { useMounted } from "@/hooks/use-mounted";
import { resolveHistoryEntryDisplay } from "@/lib/navigation-history/resolve-history-entry-display";

function SidebarHistoryButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  // Keep the HTML `disabled` attribute off during SSR/hydration. React has been
  // serializing `disabled={true}` as absent (`null`) on the server while the
  // client expects `true`, which trips a hydration mismatch on these buttons.
  const htmlDisabled = mounted ? disabled : false;

  return (
    <button
      type="button"
      className="app-side-panel-history-button"
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      disabled={htmlDisabled}
      onClick={() => {
        if (disabled) {
          return;
        }
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function SidebarNavHistoryControls() {
  const {
    canGoBack,
    canGoForward,
    recentPages,
    goBack,
    goForward,
    navigateToHistoryEntry,
  } = useNavigationHistory();
  const { mode, nextDevSwitchEnabled } = useBackendMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <div className="app-side-panel-history-toolbar" ref={menuRef}>
      {nextDevSwitchEnabled ? (
        <span
          className={[
            "app-side-panel-backend-mode-badge",
            mode === "prod"
              ? "app-side-panel-backend-mode-badge-prod"
              : "app-side-panel-backend-mode-badge-dev",
          ].join(" ")}
          title={
            mode === "prod"
              ? "Prod backend — writes go to production"
              : "Dev backend — local API / Docker Postgres"
          }
        >
          {backendModeLabel(mode)}
        </span>
      ) : null}

      <div className="app-side-panel-history-actions">
        <div className="app-side-panel-history-recent">
          <SidebarHistoryButton
            label="Recent pages"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <SidebarHistoryClockIcon />
          </SidebarHistoryButton>

          {menuOpen ? (
            <div
              className="app-side-panel-history-menu"
              role="menu"
              aria-label="Recent pages"
            >
              {recentPages.length === 0 ? (
                <p className="app-side-panel-history-empty">No recent pages yet</p>
              ) : (
                recentPages.map((entry) => {
                  const display = resolveHistoryEntryDisplay(
                    entry.href,
                    entry.title,
                  );

                  return (
                    <button
                      key={entry.href}
                      type="button"
                      role="menuitem"
                      className="app-side-panel-history-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigateToHistoryEntry(entry.href);
                      }}
                    >
                      <span className="app-side-panel-history-menu-badge">
                        {display.badgeLabel}
                      </span>
                      <span className="app-side-panel-history-menu-content">
                        <HistoryEntryIcon
                          display={display}
                          icon={entry.icon}
                          taskStatus={entry.taskStatus}
                        />
                        <span className="app-side-panel-history-menu-title">
                          {display.title}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        <SidebarHistoryButton
          label="Go back"
          disabled={!canGoBack}
          onClick={goBack}
        >
          <SidebarChevronIcon pointing="left" />
        </SidebarHistoryButton>

        <SidebarHistoryButton
          label="Go forward"
          disabled={!canGoForward}
          onClick={goForward}
        >
          <SidebarChevronIcon pointing="right" />
        </SidebarHistoryButton>
      </div>
    </div>
  );
}
