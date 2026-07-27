"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import { groupItemsByAlphaLetter } from "../alpha-group.js";
import {
  getSelectedOrganizationSlugFromPathname,
  getUniqueListItemRouteParam,
  organizationMatchesSlug,
  type OrganizationListItem,
} from "../entity-routes.js";
import { getOrganizationSidePanelHref } from "../entity-side-panel-href.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { EntityListAvatar } from "./entity-list-avatar.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";

export type SidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

export type OrganizationsSidePanelViewProps = {
  pathname: string;
  items: OrganizationListItem[];
  Link: SidePanelLinkComponent;
  onAdd?: () => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

export function OrganizationsSidePanelView({
  pathname,
  items,
  Link,
  onAdd,
  highlightedId = null,
  listRef,
  listContainerProps,
}: OrganizationsSidePanelViewProps) {
  const selectedSlug = getSelectedOrganizationSlugFromPathname(pathname);
  const grouped = groupItemsByAlphaLetter(items);

  return (
    <div className="app-content-side-panel app-content-side-panel--organizations">
      <ContentSidePanelHeader
        title="Organizations"
        actions={
          onAdd ? (
            <button
              type="button"
              className="app-side-panel-section-action"
              aria-label="Create organization"
              onClick={onAdd}
            >
              <SidePanelPlusIcon />
            </button>
          ) : undefined
        }
      />
      <div className="app-content-side-panel-main">
        {!items.length ? (
          <ContentSidePanelEmpty>
            No organizations yet. Use the plus button to add one.
          </ContentSidePanelEmpty>
        ) : (
          <ContentSidePanelList
            aria-label="Organizations"
            ref={listRef}
            {...listContainerProps}
          >
            {grouped.flatMap(([letter, entries]) => [
              <li key={`group-${letter}`} className="alpha-group-header">
                <span className="alpha-group-label">{letter}</span>
              </li>,
              ...entries.map((organization) => {
                const isActive = organizationMatchesSlug(
                  organization,
                  selectedSlug,
                );
                const href = getOrganizationSidePanelHref(
                  getUniqueListItemRouteParam(organization, items),
                  pathname,
                );
                return (
                  <li
                    key={organization.id}
                    data-keyboard-nav-item={organization.id}
                  >
                    <Link
                      to={href}
                      className={sidePanelItemClass({
                        active: isActive,
                        keyboardHighlighted: highlightedId === organization.id,
                      })}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <EntityListAvatar src={organization.avatarSrc} size={16} />
                      <span className="app-side-panel-item-label">
                        {organization.name}
                      </span>
                    </Link>
                  </li>
                );
              }),
            ])}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}
