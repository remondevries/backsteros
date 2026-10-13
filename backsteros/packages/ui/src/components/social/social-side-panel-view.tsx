"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import { groupItemsByAlphaLetter } from "../../shared/alpha-group.js";
import {
  getUniqueListItemRouteParam,
  resolveListItemFromSlug,
} from "../../navigation/entity-routes.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "../content/content-side-panel-list.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { SocialPlatformIcon } from "./social-platform-icon.js";
import {
  getSocialHref,
  primarySocialAccount,
  getSelectedSocialSlugFromPathname,
  type SocialContactListItem,
} from "../../social/social-contacts.js";

export type SocialSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

export type SocialSidePanelViewProps = {
  pathname: string;
  items: SocialContactListItem[];
  Link: SocialSidePanelLinkComponent;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

export function SocialSidePanelView({
  pathname,
  items,
  Link,
  highlightedId = null,
  listRef,
  listContainerProps,
}: SocialSidePanelViewProps) {
  const selectedSlug = getSelectedSocialSlugFromPathname(pathname);
  const selectedId =
    resolveListItemFromSlug(items, selectedSlug)?.id ?? null;
  const grouped = groupItemsByAlphaLetter(items);

  return (
    <div className="app-content-side-panel app-content-side-panel--social">
      <ContentSidePanelHeader title="Social" />
      <div className="app-content-side-panel-main">
        {!items.length ? (
          <ContentSidePanelEmpty>
            No contacts with social accounts yet.
          </ContentSidePanelEmpty>
        ) : (
          <ContentSidePanelList
            aria-label="Social contacts"
            ref={listRef}
            {...listContainerProps}
          >
            {grouped.flatMap(([letter, entries]) => [
              <li key={`group-${letter}`} className="alpha-group-header">
                <span className="alpha-group-label">{letter}</span>
              </li>,
              ...entries.map((contact) => {
                const isActive = contact.id === selectedId;
                const href = getSocialHref(
                  getUniqueListItemRouteParam(contact, items),
                );
                const primary = primarySocialAccount(contact.socialAccounts);
                return (
                  <li
                    key={contact.id}
                    data-keyboard-nav-item={contact.id}
                  >
                    <Link
                      to={href}
                      className={sidePanelItemClass({
                        active: isActive,
                        keyboardHighlighted:
                          highlightedId === contact.id,
                      })}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="social-side-panel__avatar-stack">
                        {contact.avatarSrc ? (
                          <EntityListAvatar
                            src={contact.avatarSrc}
                            size={28}
                          />
                        ) : (
                          <span
                            className="social-side-panel__avatar-fallback"
                            aria-hidden="true"
                          >
                            <ContactPersonIcon size={16} />
                          </span>
                        )}
                        {primary ? (
                          <span className="social-side-panel__avatar-badge">
                            <SocialPlatformIcon
                              platform={primary.platform}
                              size={9}
                            />
                          </span>
                        ) : null}
                      </span>
                      <span className="app-side-panel-item-label">
                        {contact.name}
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
