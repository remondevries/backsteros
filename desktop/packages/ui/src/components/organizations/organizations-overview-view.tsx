"use client";

import { useMemo, useRef, useState } from "react";

import { groupItemsByAlphaLetter } from "../../shared/alpha-group.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import type { OrganizationListItem } from "../../navigation/entity-routes.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type OrganizationsOverviewViewProps = {
  organizations: OrganizationListItem[];
  selectedId?: string | null;
  /**
   * Organization kept at the top of the list (e.g. just created) until the user
   * navigates away — ignores alpha sort while set.
   */
  pinnedOrganizationId?: string | null;
  onSelect?: (organization: OrganizationListItem) => void;
  onAdd?: () => void;
  emptyMessage?: string;
};

function organizationDisplayId(
  organization: OrganizationListItem,
): string | null {
  if (organization.number != null) return `O-${organization.number}`;
  const key = organization.key?.trim();
  return key || null;
}

/**
 * Main-content organizations catalog (alpha-grouped), projects-overview style.
 * Selection opens the right-side organization profile overlay.
 *
 * Layout chrome reuses `contacts-overview` class names (shared list/row styles).
 */
export function OrganizationsOverviewView({
  organizations,
  selectedId = null,
  pinnedOrganizationId = null,
  onSelect,
  onAdd,
  emptyMessage = "No organizations yet.",
}: OrganizationsOverviewViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const { pinnedOrganizations, sortedOrganizations } = useMemo(() => {
    if (!pinnedOrganizationId) {
      return {
        pinnedOrganizations: [] as OrganizationListItem[],
        sortedOrganizations: organizations,
      };
    }
    const pinned: OrganizationListItem[] = [];
    const rest: OrganizationListItem[] = [];
    for (const organization of organizations) {
      if (organization.id === pinnedOrganizationId) pinned.push(organization);
      else rest.push(organization);
    }
    return { pinnedOrganizations: pinned, sortedOrganizations: rest };
  }, [organizations, pinnedOrganizationId]);

  const grouped = useMemo(
    () => groupItemsByAlphaLetter(sortedOrganizations),
    [sortedOrganizations],
  );
  const itemIds = useMemo(
    () => [
      ...pinnedOrganizations.map((entry) => entry.id),
      ...grouped.flatMap(([letter, entries]) =>
        collapsed.has(letter) ? [] : entries.map((entry) => entry.id),
      ),
    ],
    [collapsed, grouped, pinnedOrganizations],
  );

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const match = organizations.find((entry) => entry.id === itemId);
      if (match) onSelect?.(match);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: organizations.length > 0,
  });

  function toggleLetter(letter: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  function renderOrganizationRow(organization: OrganizationListItem) {
    const selected = organization.id === selectedId;
    const highlighted = highlightedId === organization.id;
    const displayId = organizationDisplayId(organization);
    return (
      <li key={organization.id} {...keyboardNavItemProps(organization.id)}>
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
          onClick={() => onSelect?.(organization)}
          onKeyDown={(event) => {
            if (isDirectRoleButtonActivationKey(event)) {
              event.preventDefault();
              onSelect?.(organization);
            }
          }}
        >
          <EntityListAvatar src={organization.avatarSrc} size={20} />
          <div className="contacts-overview__body">
            <div className="contacts-overview__title-row">
              <span className="contacts-overview__name">
                {organization.name}
              </span>
              {displayId ? (
                <span className="contacts-overview__meta">{displayId}</span>
              ) : null}
            </div>
          </div>
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
            aria-label="Create organization"
            onClick={onAdd}
          >
            <SidePanelPlusIcon />
          </button>
        </div>
      ) : null}

      {organizations.length === 0 ? (
        <p className="contacts-overview__empty">{emptyMessage}</p>
      ) : (
        <ul
          className="contacts-overview__list"
          role="list"
          ref={listRef}
          {...listContainerProps}
        >
          {pinnedOrganizations.length > 0 ? (
            <li
              className="contacts-overview__pinned"
              aria-label="New organization"
            >
              <ul className="contacts-overview__pinned-list" role="list">
                {pinnedOrganizations.map((organization) =>
                  renderOrganizationRow(organization),
                )}
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
              {entries.map((organization) =>
                renderOrganizationRow(organization),
              )}
            </ProjectTypeGroupSection>
          ))}
        </ul>
      )}
    </div>
  );
}
