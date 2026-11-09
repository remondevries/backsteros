"use client";

import { useRef, type MouseEvent } from "react";

import type { ContactListItem } from "../../navigation/entity-routes.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";

export type OrganizationContactsListViewProps = {
  contacts: ContactListItem[];
  /** Real contact detail href — required so rows are links (new-tab / Cmd-click). */
  getContactHref: (contact: ContactListItem) => string;
  onSelectContact?: (contact: ContactListItem) => void;
  selectedContactId?: string | null;
};

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * Organization contacts list — name / subtitle rows with optional uploaded
 * avatar only (same rule as contacts/orgs side panels — no default icon).
 *
 * Rows are plain anchors (not ClientLink) so primary-click can open a new
 * product tab without the shell link handler dismissing the org keep-alive.
 */
export function OrganizationContactsListView({
  contacts,
  getContactHref,
  onSelectContact,
  selectedContactId = null,
}: OrganizationContactsListViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const itemIds = contacts.map((contact) => contact.id);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedContactId,
    onNavigate: (contactId) => {
      const contact = contacts.find((entry) => entry.id === contactId);
      if (contact) onSelectContact?.(contact);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  if (!contacts.length) {
    return (
      <div className="organization-entity-list__empty">
        <p>No contacts linked to this organization yet.</p>
        <p className="organization-entity-list__empty-hint">
          Use <strong>Create new contact</strong> above to add one linked to
          this organization.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="organization-entity-list"
      aria-label="Organization contacts"
      {...listContainerProps}
    >
      <ul className="organization-entity-list__items" role="list">
        {contacts.map((contact) => {
          const subtitle = [contact.title, contact.email]
            .filter(Boolean)
            .join(" · ");
          const href = getContactHref(contact);
          return (
            <li key={contact.id} {...keyboardNavItemProps(contact.id)}>
              <a
                href={href}
                className={`organization-entity-row ${keyboardNavListItemClass(highlightedId === contact.id)}`}
                onClick={(event) => {
                  // Cmd/Ctrl-click keeps the real href so ModClickNewTabListener
                  // can open a product tab. Plain click uses onSelectContact
                  // (also new-tab from the org Contacts tab).
                  if (isModifiedClick(event)) return;
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectContact?.(contact);
                }}
              >
                <EntityListAvatar
                  src={contact.avatarSrc}
                  size={14}
                  className="organization-entity-row__icon"
                />
                <span className="organization-entity-row__body">
                  <span className="organization-entity-row__label">
                    {contact.name}
                  </span>
                  {subtitle ? (
                    <span className="organization-entity-row__subtitle">
                      {subtitle}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
