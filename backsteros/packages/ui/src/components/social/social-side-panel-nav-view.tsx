"use client";

import {
  BellIcon,
  BookmarkIcon,
  GraphIcon,
  HomeIcon,
  PersonIcon,
  SearchIcon,
} from "@primer/octicons-react";
import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import {
  SOCIAL_NAV_ITEMS,
  getSelectedSocialNavIdFromPathname,
  type SocialNavId,
  type SocialNavItem,
} from "../../social/social-nav.js";
import { keyboardNavItemClass, keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";

export type SocialSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}>;

export type SocialSidePanelNavViewProps = {
  pathname: string;
  Link: SocialSidePanelLinkComponent;
  onNavigate?: () => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

export function SocialSectionNavIcon({ id }: { id: SocialNavId }) {
  const props = { size: 16, className: "nav-icon" } as const;
  switch (id) {
    case "home":
      return <HomeIcon {...props} />;
    case "analytics":
      return <GraphIcon {...props} />;
    case "explore":
      return <SearchIcon {...props} />;
    case "notifications":
      return <BellIcon {...props} />;
    case "bookmarks":
      return <BookmarkIcon {...props} />;
    case "profile":
      return <PersonIcon {...props} />;
  }
}

function SocialNavLink({
  item,
  active,
  keyboardHighlighted,
  Link,
  onNavigate,
}: {
  item: SocialNavItem;
  active: boolean;
  keyboardHighlighted: boolean;
  Link: SocialSidePanelLinkComponent;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={item.href}
      className={[
        "sidebar-link",
        "social-side-panel-nav__link",
        active ? "is-active" : null,
        keyboardNavItemClass(keyboardHighlighted),
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      {...keyboardNavItemProps(item.id)}
    >
      <span className="nav-icon-wrap" aria-hidden="true">
        <SocialSectionNavIcon id={item.id} />
      </span>
      <span className="sidebar-link-label">{item.label}</span>
    </Link>
  );
}

export function SocialSidePanelNavView({
  pathname,
  Link,
  onNavigate,
  highlightedId = null,
  listRef,
  listContainerProps,
}: SocialSidePanelNavViewProps) {
  const activeNavId = getSelectedSocialNavIdFromPathname(pathname);

  return (
    <div className="app-content-side-panel app-content-side-panel--social">
      <ContentSidePanelHeader title="Network" />
      <div className="app-content-side-panel-main">
        <div
          className="app-content-side-panel-body social-side-panel-nav"
          ref={listRef as Ref<HTMLDivElement>}
          {...listContainerProps}
        >
          <nav className="social-side-panel-nav__nav" aria-label="Network">
            {SOCIAL_NAV_ITEMS.map((item) => (
              <SocialNavLink
                key={item.id}
                item={item}
                active={activeNavId === item.id}
                keyboardHighlighted={highlightedId === item.id}
                Link={Link}
                onNavigate={onNavigate}
              />
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
