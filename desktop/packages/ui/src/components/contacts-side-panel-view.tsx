"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import { groupItemsByAlphaLetter } from "../alpha-group.js";
import {
  getSelectedContactSlugFromPathname,
  getUniqueListItemRouteParam,
  type ContactListItem,
  contactMatchesSlug,
} from "../entity-routes.js";
import { getContactSidePanelHref } from "../entity-side-panel-href.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { EntityListAvatar } from "./entity-list-avatar.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";

export type ContactsSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

export type ContactsSidePanelViewProps = {
  pathname: string;
  items: ContactListItem[];
  Link: ContactsSidePanelLinkComponent;
  onAdd?: () => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

export function ContactsSidePanelView({
  pathname,
  items,
  Link,
  onAdd,
  highlightedId = null,
  listRef,
  listContainerProps,
}: ContactsSidePanelViewProps) {
  const selectedSlug = getSelectedContactSlugFromPathname(pathname);
  const grouped = groupItemsByAlphaLetter(items);

  return (
    <div className="app-content-side-panel app-content-side-panel--contacts">
      <ContentSidePanelHeader
        title="Contacts"
        actions={
          onAdd ? (
            <button
              type="button"
              className="app-side-panel-section-action"
              aria-label="Create contact"
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
            No contacts yet. Use the plus button to add one.
          </ContentSidePanelEmpty>
        ) : (
          <ContentSidePanelList
            aria-label="Contacts"
            ref={listRef}
            {...listContainerProps}
          >
            {grouped.flatMap(([letter, entries]) => [
              <li key={`group-${letter}`} className="alpha-group-header">
                <span className="alpha-group-label">{letter}</span>
              </li>,
              ...entries.map((contact) => {
                const isActive = contactMatchesSlug(contact, selectedSlug);
                const href = getContactSidePanelHref(
                  getUniqueListItemRouteParam(contact, items),
                  pathname,
                );
                return (
                  <li key={contact.id} data-keyboard-nav-item={contact.id}>
                    <Link
                      to={href}
                      className={sidePanelItemClass({
                        active: isActive,
                        keyboardHighlighted: highlightedId === contact.id,
                      })}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <EntityListAvatar
                        src={contact.avatarSrc}
                        size={16}
                        align="top"
                      />
                      <span className="side-panel-item-stack">
                        <span className="app-side-panel-item-label">
                          {contact.name}
                        </span>
                        {contact.organizationName ? (
                          <span className="side-panel-item-subtitle">
                            {contact.organizationName}
                          </span>
                        ) : null}
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
