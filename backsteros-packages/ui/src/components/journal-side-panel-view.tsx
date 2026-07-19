"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import {
  formatJournalSidePanelLabel,
  getJournalHref,
  getSelectedJournalDateFromPathname,
  getTodayJournalDateSlug,
} from "../journal.js";
import { keyboardNavItemProps } from "../keyboard-nav-item.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";

export type JournalSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

export type JournalListItem = {
  dateSlug: string;
};

export type JournalSidePanelViewProps = {
  pathname: string;
  items: JournalListItem[];
  Link: JournalSidePanelLinkComponent;
  todaySlug?: string;
  onCreateToday?: () => void;
  createTodayDisabled?: boolean;
  createTodayError?: string | null;
  emptyLabel?: string;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

/**
 * Presentational journal side panel — date list + optional Today badge.
 */
export function JournalSidePanelView({
  pathname,
  items,
  Link,
  todaySlug = getTodayJournalDateSlug(),
  onCreateToday,
  createTodayDisabled = false,
  createTodayError = null,
  emptyLabel = "No journal entries yet. Use the plus button for today.",
  highlightedId = null,
  listRef,
  listContainerProps,
}: JournalSidePanelViewProps) {
  const selectedDate = getSelectedJournalDateFromPathname(pathname);

  return (
    <div className="app-content-side-panel app-content-side-panel--journal">
      <ContentSidePanelHeader
        title="Journal"
        actions={
          onCreateToday ? (
            <button
              type="button"
              onClick={onCreateToday}
              disabled={createTodayDisabled}
              className="app-side-panel-section-action"
              aria-label="Open today's journal"
            >
              <SidePanelPlusIcon />
            </button>
          ) : undefined
        }
      />
      {createTodayError ? (
        <p className="app-content-side-panel-empty" role="alert">
          {createTodayError}
        </p>
      ) : null}
      <div className="app-content-side-panel-main">
        {!items.length ? (
          <ContentSidePanelEmpty>{emptyLabel}</ContentSidePanelEmpty>
        ) : (
          <ContentSidePanelList
            aria-label="Journal entries"
            ref={listRef}
            {...listContainerProps}
          >
            {items.map(({ dateSlug }) => {
              const isActive = selectedDate === dateSlug;
              const isToday = dateSlug === todaySlug;

              return (
                <li key={dateSlug} className="inbox-list-item">
                  <Link
                    to={getJournalHref(dateSlug)}
                    className={sidePanelItemClass({
                      active: isActive,
                      keyboardHighlighted: highlightedId === dateSlug,
                    })}
                    aria-current={isActive ? "page" : undefined}
                    {...keyboardNavItemProps(dateSlug)}
                  >
                    <span className="app-side-panel-item-label">
                      {formatJournalSidePanelLabel(dateSlug)}
                      {isToday ? (
                        <span className="journal-side-panel-today">Today</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}
