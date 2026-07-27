"use client";

import {
  useState,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  formatLetterDisplayId,
  getLettersHref,
  getSelectedLetterSlugFromPathname,
  groupLettersByStatus,
  letterMatchesSlug,
  type LetterListItem,
} from "../letters.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { LetterIcon } from "./letter-icon.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import { StatusGroupSection } from "./status-group-section.js";
import { LettersSidePanelSkeleton } from "./skeletons/letter-detail-skeleton.js";

export type LettersSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  children: ReactNode;
  onClick?: () => void;
}>;

export type LettersSidePanelViewProps = {
  pathname: string;
  items: LetterListItem[];
  Link: LettersSidePanelLinkComponent;
  composeHref?: string;
  onCompose?: () => void;
  /** Override letter detail href (defaults to global `/letters/:slug`). */
  getLetterHref?: (letter: LetterListItem) => string;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /** Show list skeleton while workspace metadata is loading. */
  loading?: boolean;
};

export function LettersSidePanelView({
  pathname,
  items,
  Link,
  composeHref = "/letters/new",
  onCompose,
  getLetterHref = (letter) => getLettersHref(letter.number),
  highlightedId = null,
  listRef,
  listContainerProps,
  loading = false,
}: LettersSidePanelViewProps) {
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const groups = groupLettersByStatus(items);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  return (
    <div className="app-content-side-panel app-content-side-panel--letters">
      <ContentSidePanelHeader
        title="Letters"
        actions={
          <Link
            to={composeHref}
            className="app-side-panel-section-action"
            aria-label="Upload letter"
            onClick={onCompose}
          >
            <SidePanelPlusIcon />
          </Link>
        }
      />
      <div className="app-content-side-panel-main">
        {loading && !items.length ? (
          <LettersSidePanelSkeleton />
        ) : !items.length ? (
          <ContentSidePanelEmpty>
            No letters yet. Use the plus button to upload one.
          </ContentSidePanelEmpty>
        ) : (
          <ContentSidePanelList
            aria-label="Letters"
            ref={listRef}
            {...listContainerProps}
          >
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
                  {group.letters.map((letter) => {
                    const isActive = letterMatchesSlug(letter, selectedSlug);
                    const href = getLetterHref(letter);
                    return (
                      <li key={letter.id} data-keyboard-nav-item={letter.id}>
                        <Link
                          to={href}
                          className={sidePanelItemClass({
                            active: isActive,
                            keyboardHighlighted: highlightedId === letter.id,
                          })}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <span
                            className="app-side-panel-item-icon"
                            aria-hidden="true"
                          >
                            <LetterIcon size={14} />
                          </span>
                          <span className="letter-display-id">
                            {formatLetterDisplayId(letter.number)}
                          </span>
                          <span className="app-side-panel-item-label">
                            {letter.title}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </StatusGroupSection>
              );
            })}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}
