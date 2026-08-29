"use client";

import { useMemo, useRef, useState } from "react";

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
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type ContactsOverviewViewProps = {
  contacts: ContactListItem[];
  selectedId?: string | null;
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
  onSelect,
  onAdd,
  emptyMessage = "No contacts yet.",
}: ContactsOverviewViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const grouped = useMemo(() => groupItemsByAlphaLetter(contacts), [contacts]);
  const itemIds = useMemo(
    () =>
      grouped.flatMap(([letter, entries]) =>
        collapsed.has(letter) ? [] : entries.map((entry) => entry.id),
      ),
    [collapsed, grouped],
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
          {grouped.map(([letter, entries]) => (
            <ProjectTypeGroupSection
              key={letter}
              title={letter}
              collapsed={collapsed.has(letter)}
              onToggle={() => toggleLetter(letter)}
            >
              {entries.map((contact) => {
                const selected = contact.id === selectedId;
                const highlighted = highlightedId === contact.id;
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
                      <span className="contacts-overview__name">
                        {contact.name}
                      </span>
                      {contact.organizationName ? (
                        <span className="contacts-overview__meta">
                          {contact.organizationName}
                        </span>
                      ) : null}
                      {contact.email ? (
                        <span className="contacts-overview__meta contacts-overview__meta--email">
                          {contact.email}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ProjectTypeGroupSection>
          ))}
        </ul>
      )}
    </div>
  );
}
