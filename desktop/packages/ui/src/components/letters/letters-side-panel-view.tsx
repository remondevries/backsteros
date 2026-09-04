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
  resolveLetterDetailHref,
  type LetterListItem,
} from "../../letters/letters.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "../content/content-side-panel-list.js";
import { LetterIcon } from "./letter-icon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { LettersSidePanelSkeleton } from "../skeletons/letter-detail-skeleton.js";

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
  /**
   * Immediate create (preferred). When set, the plus control is a button and
   * does not navigate to compose.
   */
  onAdd?: () => void;
  /** Fallback compose route when `onAdd` is not provided. */
  composeHref?: string;
  onCompose?: () => void;
  /** Override letter detail href (defaults to global `/letters/:slug`). */
  getLetterHref?: (letter: LetterListItem) => string;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /** Show list skeleton while workspace metadata is loading. */
  loading?: boolean;
  title?: string;
  /**
   * Controlled collapsed status keys (keeps j/k itemIds in sync). When omitted,
   * collapse state is owned locally by this view.
   */
  collapsedKeys?: ReadonlySet<string>;
  onToggleCollapsed?: (status: string) => void;
};

export function LettersSidePanelView({
  pathname,
  items,
  Link,
  onAdd,
  composeHref = "/letters/new",
  onCompose,
  getLetterHref = (letter) =>
    resolveLetterDetailHref({
      id: letter.id,
      number: letter.number,
      listBaseHref: "/letters",
    }),
  highlightedId = null,
  listRef,
  listContainerProps,
  loading = false,
  title = "Letters",
  collapsedKeys: controlledCollapsedKeys,
  onToggleCollapsed,
}: LettersSidePanelViewProps) {
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const groups = groupLettersByStatus(items);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState<
    Set<string>
  >(() => new Set());
  const collapsed =
    controlledCollapsedKeys ?? uncontrolledCollapsed;

  function toggleCollapsed(status: string) {
    if (onToggleCollapsed) {
      onToggleCollapsed(status);
      return;
    }
    setUncontrolledCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div className="app-content-side-panel app-content-side-panel--letters">
      <ContentSidePanelHeader
        title={title}
        actions={
          onAdd ? (
            <button
              type="button"
              className="app-side-panel-section-action"
              aria-label="Create letter"
              onClick={onAdd}
            >
              <SidePanelPlusIcon />
            </button>
          ) : (
            <Link
              to={composeHref}
              className="app-side-panel-section-action"
              aria-label="Upload letter"
              onClick={onCompose}
            >
              <SidePanelPlusIcon />
            </Link>
          )
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
                  onToggle={() => toggleCollapsed(group.status)}
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
                            {letter.number != null
                              ? formatLetterDisplayId(letter.number)
                              : letter.id.slice(0, 8)}
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
