"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import {
  isNavigationPathActive,
  navigation,
  navigationSections,
} from "../navigation.js";
import {
  SETTINGS_SHORTCUT_HINT,
  getDefaultSettingsHref,
} from "../settings.js";
import { getNavigationItemIcon } from "./navigation-item-icon.js";
import { ProfileLogoIcon } from "./profile-logo-icon.js";
import { DotScrollLoader } from "./dot-scroll-loader.js";
import {
  SearchNavIcon,
  SidebarAccountIcon,
  SidebarChevronIcon,
  SidebarComposeIcon,
  SidebarHistoryClockIcon,
  SidebarLogoutIcon,
  SidebarSettingsIcon,
  SyncStatusIdleIcon,
} from "./sidebar-nav-icons.js";

export type ProductSidebarLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  title?: string;
  children: ReactNode;
  onClick?: () => void;
}>;

export type ProductSidebarRecentPage = {
  id: string;
  href: string;
  title: string;
  badge?: string;
  icon?: ReactNode;
};

export type ProductSidebarProps = {
  pathname: string;
  Link: ProductSidebarLinkComponent;
  displayName?: string;
  onSearch?: () => void;
  onCompose?: () => void;
  onSyncNow?: () => void | Promise<void>;
  syncStatusLabel?: string;
  syncTitle?: string;
  lastSyncLabel?: string | null;
  /** When true, profile trigger shows DotScrollLoader + “Syncing…”. */
  syncInProgress?: boolean;
  syncOffline?: boolean;
  /** Opens Clerk account / host account UI — matches Next.js profile menu. */
  onAccount?: () => void;
  /** Signs out — shown with Account + divider when provided. */
  onSignOut?: () => void | Promise<void>;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  searchShortcutHint?: string;
  recentPages?: ProductSidebarRecentPage[];
  onSelectRecentPage?: (href: string) => void;
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

function NavLinks({
  pathname,
  Link,
}: {
  pathname: string;
  Link: ProductSidebarLinkComponent;
}) {
  return (
    <nav className="sidebar-sections" aria-label="Workspace">
      {navigationSections.map((section) => (
        <section key={section.id}>
          {section.label ? <h2>{section.label}</h2> : null}
          {navigation
            .filter((item) => item.section === section.id)
            .map((item) => {
              const Icon = getNavigationItemIcon(item.icon);
              const active = isNavigationPathActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`sidebar-link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {Icon ? <Icon className="nav-icon" /> : null}
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
        </section>
      ))}
    </nav>
  );
}

/**
 * Left product sidebar — same structure/look as `backsteros-app` NavLinks shell.
 * Settings lives in the profile dropdown (not the main nav), matching Next.js.
 */
export function ProductSidebar({
  pathname,
  Link,
  displayName = "Remon de Vries",
  onSearch,
  onCompose,
  onSyncNow,
  syncStatusLabel = "Sync now",
  syncTitle,
  lastSyncLabel = null,
  syncInProgress = false,
  syncOffline = false,
  onAccount,
  onSignOut,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
  searchShortcutHint = "⌘K",
  recentPages = [],
  onSelectRecentPage,
}: ProductSidebarProps) {
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const settingsHref = getDefaultSettingsHref();
  const closeProfileMenu = () => setProfileMenuOpen(false);
  const showAccountActions = Boolean(onAccount || onSignOut);
  const triggerSyncing = syncInProgress || syncOffline;

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

  useEffect(() => {
    if (!profileMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen]);

  return (
    <div className="sidebar-inner">
      <div
        className="app-side-panel-history-toolbar"
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

      <div className="profile-row app-side-panel-profile-row">
        <div className="app-side-panel-profile" ref={profileMenuRef}>
          <button
            type="button"
            className={[
              "app-side-panel-profile-trigger",
              profileMenuOpen ? "app-side-panel-profile-trigger-open" : null,
              triggerSyncing ? "app-side-panel-profile-trigger-sync" : null,
              syncOffline
                ? "app-side-panel-profile-trigger-sync-offline"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={
              syncInProgress
                ? "Open profile menu, Syncing…"
                : "Open profile menu"
            }
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            aria-busy={syncInProgress}
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <span
              className={[
                "app-side-panel-profile-logo",
                syncInProgress ? "app-side-panel-profile-logo-sync" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            >
              {syncInProgress ? (
                <DotScrollLoader
                  status={syncOffline ? "waiting" : "working"}
                  squareDots
                  className="app-side-panel-profile-sync-loader"
                  aria-label="Syncing"
                />
              ) : (
                <ProfileLogoIcon className="app-side-panel-profile-logo-mark" />
              )}
            </span>
            <span
              className={[
                "app-side-panel-profile-name",
                syncInProgress ? "app-side-panel-profile-name-sync" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {syncInProgress ? "Syncing…" : displayName}
            </span>
            <SidebarChevronIcon
              className="app-side-panel-profile-trigger-chevron"
              pointing="down"
              expanded={profileMenuOpen}
            />
          </button>

          {profileMenuOpen ? (
            <div
              className="app-side-panel-profile-menu"
              role="menu"
              aria-label="Profile menu"
            >
              <div className="app-side-panel-profile-menu-section">
                <Link
                  to={settingsHref}
                  className="app-side-panel-item app-side-panel-profile-menu-item"
                  title={`Settings (${SETTINGS_SHORTCUT_HINT})`}
                  onClick={closeProfileMenu}
                >
                  <span className="app-side-panel-item-icon" aria-hidden="true">
                    <SidebarSettingsIcon size={14} />
                  </span>
                  <span className="app-side-panel-item-label">Settings</span>
                </Link>
                {onSyncNow ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="app-side-panel-item app-side-panel-profile-menu-item"
                    title={syncTitle}
                    onClick={() => {
                      closeProfileMenu();
                      void onSyncNow();
                    }}
                  >
                    <span className="app-side-panel-item-icon" aria-hidden="true">
                      <SyncStatusIdleIcon size={14} />
                    </span>
                    <span className="app-side-panel-item-label">
                      {syncStatusLabel}
                    </span>
                    {lastSyncLabel ? (
                      <span className="app-side-panel-profile-menu-item-meta">
                        {lastSyncLabel}
                      </span>
                    ) : null}
                  </button>
                ) : null}
                {onAccount ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="app-side-panel-item app-side-panel-profile-menu-item"
                    onClick={() => {
                      closeProfileMenu();
                      onAccount();
                    }}
                  >
                    <span className="app-side-panel-item-icon" aria-hidden="true">
                      <SidebarAccountIcon size={14} />
                    </span>
                    <span className="app-side-panel-item-label">Account</span>
                  </button>
                ) : null}
                {showAccountActions && onSignOut ? (
                  <div
                    className="app-side-panel-profile-menu-divider"
                    role="separator"
                    aria-hidden="true"
                  />
                ) : null}
                {onSignOut ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="app-side-panel-item app-side-panel-profile-menu-item"
                    onClick={() => {
                      closeProfileMenu();
                      void onSignOut();
                    }}
                  >
                    <span className="app-side-panel-item-icon" aria-hidden="true">
                      <SidebarLogoutIcon />
                    </span>
                    <span className="app-side-panel-item-label">Log out</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="app-side-panel-compose-trigger"
          aria-label="Create item"
          title="Create item"
          onClick={onCompose}
        >
          <SidebarComposeIcon />
        </button>
      </div>

      <NavLinks pathname={pathname} Link={Link} />

      <div className="sidebar-footer">
        <button type="button" onClick={onSearch}>
          <SearchNavIcon /> Search <kbd>{searchShortcutHint}</kbd>
        </button>
      </div>
    </div>
  );
}
