"use client";

import { useMemo, useRef, useState } from "react";

import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../keyboard-nav-item.js";
import {
  formatLetterDisplayId,
  groupLettersByStatus,
  type LetterListItem,
} from "../letters.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import { LetterIcon } from "./letter-icon.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "./status-group-section.js";

export type ProjectLettersSectionViewProps = {
  letters: LetterListItem[];
  onSelectLetter?: (letter: LetterListItem) => void;
  selectedLetterId?: string | null;
  emptyMessage?: string;
};

/** Project letters pane — status-grouped list matching the web side panel. */
export function ProjectLettersSectionView({
  letters,
  onSelectLetter,
  selectedLetterId = null,
  emptyMessage = "No letters linked to this project.",
}: ProjectLettersSectionViewProps) {
  const groups = useMemo(() => groupLettersByStatus(letters), [letters]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.letters })),
        collapsed,
        (letter) => letter.id,
      ),
    [collapsed, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedLetterId,
    onNavigate: (letterId) => {
      const letter = letters.find((entry) => entry.id === letterId);
      if (letter) onSelectLetter?.(letter);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  if (!letters.length) {
    return (
      <div className="project-detail__placeholder">
        <p className="overview-empty">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="project-detail__entity-list"
      aria-label="Project letters"
      {...listContainerProps}
    >
      <ul className="overview-grouped-list" role="list">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.status);
          return (
            <StatusGroupSection
              key={group.status}
              groupKey={group.status}
              title={group.label}
              collapsed={isCollapsed}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.status)) next.delete(group.status);
                  else next.add(group.status);
                  return next;
                })
              }
            >
              {group.letters.map((letter) => (
                <li key={letter.id} {...keyboardNavItemProps(letter.id)}>
                  <button
                    type="button"
                    className={`project-detail__entity-row ${keyboardNavListItemClass(highlightedId === letter.id)}`}
                    onClick={() => onSelectLetter?.(letter)}
                  >
                    <span
                      className="project-detail__entity-row-icon"
                      aria-hidden="true"
                    >
                      <LetterIcon size={14} />
                    </span>
                    <span className="project-detail__letter-id">
                      {formatLetterDisplayId(letter.number)}
                    </span>
                    <span className="project-detail__entity-row-label">
                      {letter.title}
                    </span>
                  </button>
                </li>
              ))}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
