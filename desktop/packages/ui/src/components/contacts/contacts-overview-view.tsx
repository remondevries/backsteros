"use client";

import { useMemo, useRef, useState } from "react";
import {
  getContactEmailAddresses,
  getContactPhoneNumbers,
} from "@backsteros/contracts";

import { groupItemsByAlphaLetter } from "../../shared/alpha-group.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import type { ContactListItem } from "../../navigation/entity-routes.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { CrmGroupLabel } from "../crm/crm-group-label.js";
import { ContactSocialLabel } from "./contact-social-label.js";
import { MeetingPhoneIcon } from "../meetings/meeting-format-icons.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type ContactsOverviewViewProps = {
  contacts: ContactListItem[];
  selectedId?: string | null;
  /**
   * Contact kept at the top of the list (e.g. just created) until the user
   * navigates away — ignores alpha sort while set.
   */
  pinnedContactId?: string | null;
  onSelect?: (contact: ContactListItem) => void;
  onAdd?: () => void;
  emptyMessage?: string;
};

/**
 * Main-content contacts catalog (alpha-grouped), projects-overview style.
 * Selection opens the right-side contact profile overlay.
 */
export function ContactsOverviewView({
  contacts,
  selectedId = null,
  pinnedContactId = null,
  onSelect,
  onAdd,
  emptyMessage = "No contacts yet.",
}: ContactsOverviewViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const { pinnedContacts, sortedContacts } = useMemo(() => {
    if (!pinnedContactId) {
      return { pinnedContacts: [] as ContactListItem[], sortedContacts: contacts };
    }
    const pinned: ContactListItem[] = [];
    const rest: ContactListItem[] = [];
    for (const contact of contacts) {
      if (contact.id === pinnedContactId) pinned.push(contact);
      else rest.push(contact);
    }
    return { pinnedContacts: pinned, sortedContacts: rest };
  }, [contacts, pinnedContactId]);

  const grouped = useMemo(
    () => groupItemsByAlphaLetter(sortedContacts),
    [sortedContacts],
  );
  const itemIds = useMemo(
    () => [
      ...pinnedContacts.map((entry) => entry.id),
      ...grouped.flatMap(([letter, entries]) =>
        collapsed.has(letter) ? [] : entries.map((entry) => entry.id),
      ),
    ],
    [collapsed, grouped, pinnedContacts],
  );

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const match = contacts.find((entry) => entry.id === itemId);
      if (match) onSelect?.(match);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: contacts.length > 0,
  });

  function toggleLetter(letter: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  function renderContactRow(contact: ContactListItem) {
    const selected = contact.id === selectedId;
    const highlighted = highlightedId === contact.id;
    const email =
      getContactEmailAddresses({
        email: contact.email,
        emails: contact.emails,
      })[0] ?? null;
    const phone =
      getContactPhoneNumbers({
        phone: contact.phone,
        phones: contact.phones,
      })[0] ?? null;
    const groups = contact.groups ?? [];
    const socialAccounts = (contact.socialAccounts ?? []).filter(
      (entry) => entry.platform.trim() && entry.url.trim(),
    );
    return (
      <li key={contact.id} {...keyboardNavItemProps(contact.id)}>
        <div
          role="button"
          tabIndex={0}
          className={[
            "contacts-overview__row",
            keyboardNavListItemClass(highlighted),
            selected ? "is-selected" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelect?.(contact)}
          onKeyDown={(event) => {
            if (isDirectRoleButtonActivationKey(event)) {
              event.preventDefault();
              onSelect?.(contact);
            }
          }}
        >
          <EntityListAvatar src={contact.avatarSrc} size={20} />
          <div className="contacts-overview__body">
            <div className="contacts-overview__title-row">
              <span className="contacts-overview__name">{contact.name}</span>
              {contact.organizationName ? (
                <span className="contacts-overview__meta">
                  {contact.organizationName}
                </span>
              ) : null}
            </div>
            {email || phone ? (
              <div className="contacts-overview__contact-row">
                {email ? (
                  <span
                    className="contacts-overview__contact-item"
                    title={email}
                  >
                    <EmailNavIcon size={12} />
                    <span>{email}</span>
                  </span>
                ) : null}
                {phone ? (
                  <span
                    className="contacts-overview__contact-item"
                    title={phone}
                  >
                    <MeetingPhoneIcon size={12} />
                    <span>{phone}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {groups.length > 0 || socialAccounts.length > 0 ? (
            <div className="contacts-overview__groups" aria-label="Labels">
              {groups.map((group) => (
                <CrmGroupLabel
                  key={group.id}
                  name={group.name}
                  color={group.color}
                  compact
                />
              ))}
              {socialAccounts.map((account) => (
                <ContactSocialLabel
                  key={`${account.platform}:${account.url}`}
                  platform={account.platform}
                  url={account.url}
                  compact
                />
              ))}
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="contacts-overview">
      {onAdd ? (
        <div className="contacts-overview__toolbar">
          <button
            type="button"
            className="app-side-panel-section-action"
            aria-label="Create contact"
            onClick={onAdd}
          >
            <SidePanelPlusIcon />
          </button>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <p className="contacts-overview__empty">{emptyMessage}</p>
      ) : (
        <ul
          className="contacts-overview__list"
          role="list"
          ref={listRef}
          {...listContainerProps}
        >
          {pinnedContacts.length > 0 ? (
            <li className="contacts-overview__pinned" aria-label="New contact">
              <ul className="contacts-overview__pinned-list" role="list">
                {pinnedContacts.map((contact) => renderContactRow(contact))}
              </ul>
            </li>
          ) : null}
          {grouped.map(([letter, entries]) => (
            <ProjectTypeGroupSection
              key={letter}
              title={letter}
              collapsed={collapsed.has(letter)}
              onToggle={() => toggleLetter(letter)}
            >
              {entries.map((contact) => renderContactRow(contact))}
            </ProjectTypeGroupSection>
          ))}
        </ul>
      )}
    </div>
  );
}
