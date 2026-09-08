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
} from "../../navigation/navigation.js";
import {
  SETTINGS_SHORTCUT_HINT,
  getDefaultSettingsHref,
} from "../../navigation/settings.js";
import { getNavigationItemIcon } from "../navigation/navigation-item-icon.js";
import { DevelopmentAdeLogoIcon } from "../icons/development-ade-logo-icon.js";
import {
  ProductHistoryToolbar,
  type ProductHistoryRecentPage,
} from "./product-history-toolbar.js";
import {
  inboxSidebarIndicatorColor,
  type InboxSidebarIndicatorTone,
} from "../../calendar/calendar-meeting-overlay.js";
import {
  SidebarChevronIcon,
  SidebarComposeIcon,
  SidebarSettingsIcon,
} from "./sidebar-nav-icons.js";

export type ProductSidebarLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  title?: string;
  children: ReactNode;
  onClick?: () => void;
}>;

/** @deprecated Prefer {@link ProductHistoryRecentPage}. */
export type ProductSidebarRecentPage = ProductHistoryRecentPage;

export type ProductSidebarProps = {
  pathname: string;
  /**
   * Pathname used for nav active matching. Defaults to `pathname`.
   * Use when project detail routes should highlight Development/Areas
   * based on which list the user opened the project from.
   */
  activePathname?: string;
  Link: ProductSidebarLinkComponent;
  displayName?: string;
  onCompose?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  recentPages?: ProductSidebarRecentPage[];
  onSelectRecentPage?: (href: string) => void;
  /** Inbox attention dot tone (orange / green / muted). */
  inboxIndicatorTone?: InboxSidebarIndicatorTone;
  /** @deprecated Prefer {@link inboxIndicatorTone}. */
  inboxHasItems?: boolean;
  /** Bottom-left footer (e.g. Cursor credits). Replaces the old search button. */
  footer?: ReactNode;
};

function NavLinks({
  activePathname,
  Link,
  inboxIndicatorTone = "none",
}: {
  activePathname: string;
  Link: ProductSidebarLinkComponent;
  inboxIndicatorTone?: InboxSidebarIndicatorTone;
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
              const active = isNavigationPathActive(activePathname, item.href);
              const inboxDotColor =
                item.href === "/inbox"
                  ? inboxSidebarIndicatorColor(inboxIndicatorTone)
                  : "";
              const showInboxDot = inboxDotColor !== "";
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`sidebar-link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {Icon ? (
                    <span className="nav-icon-wrap">
                      <Icon className="nav-icon" />
                      {showInboxDot ? (
                        <span
                          className="sidebar-link-indicator-dot"
                          style={{ background: inboxDotColor }}
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                  ) : null}
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
  activePathname = pathname,
  Link,
  displayName = "BacksterOS",
  onCompose,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
  recentPages = [],
  onSelectRecentPage,
  inboxIndicatorTone = "none",
  inboxHasItems = false,
  footer,
}: ProductSidebarProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const settingsHref = getDefaultSettingsHref();
  const closeProfileMenu = () => setProfileMenuOpen(false);

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
      <ProductHistoryToolbar
        onBack={onBack}
        onForward={onForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        recentPages={recentPages}
        onSelectRecentPage={onSelectRecentPage}
      />

      <div className="profile-row app-side-panel-profile-row">
        <div className="app-side-panel-profile" ref={profileMenuRef}>
          <button
            type="button"
            className={[
              "app-side-panel-profile-trigger",
              profileMenuOpen ? "app-side-panel-profile-trigger-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <span
              className="app-side-panel-profile-logo"
              aria-hidden="true"
            >
              <DevelopmentAdeLogoIcon className="app-side-panel-profile-logo-mark" />
            </span>
            <span
              className={[
                "app-side-panel-profile-name",
                displayName === "BacksterOS"
                  ? "app-side-panel-brand-name"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {displayName === "BacksterOS" ? (
                <>
                  <span className="app-side-panel-brand-name-thin">Backster</span>
                  <span className="app-side-panel-brand-name-bold">OS</span>
                </>
              ) : (
                displayName
              )}
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

      <NavLinks
        activePathname={activePathname}
        Link={Link}
        inboxIndicatorTone={
          inboxIndicatorTone !== "none"
            ? inboxIndicatorTone
            : inboxHasItems
              ? "muted"
              : "none"
        }
      />

      {footer ? <div className="sidebar-footer">{footer}</div> : null}
    </div>
  );
}
