"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import { groupItemsByAlphaLetter } from "../../shared/alpha-group.js";
import { getUniqueListItemRouteParam } from "../../navigation/entity-routes.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { ContentSidePanelShell } from "../content/content-side-panel-shell.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type AlphaGroupedEntitySidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

export type AlphaGroupedEntityListItem = {
  id: string;
  name: string;
  avatarSrc?: string | null;
};

export type AlphaGroupedEntitySidePanelViewProps<
  T extends AlphaGroupedEntityListItem,
> = {
  pathname: string;
  items: T[];
  Link: AlphaGroupedEntitySidePanelLinkComponent;
  title: string;
  listAriaLabel: string;
  emptyLabel: ReactNode;
  className?: string;
  createAriaLabel: string;
  onAdd?: () => void;
  getSelectedSlug: (pathname: string) => string | null;
  matchesSlug: (item: T, slug: string | null) => boolean;
  getHref: (routeParam: string, pathname: string) => string;
  /** Optional second line under the name (e.g. contact organization). */
  renderSubtitle?: (item: T) => ReactNode;
  /** Avatar alignment — contacts use top for stacked labels. */
  avatarAlign?: "center" | "top";
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

/**
 * Alpha-letter grouped entity list (Contacts / Organizations).
 */
export function AlphaGroupedEntitySidePanelView<
  T extends AlphaGroupedEntityListItem,
>({
  pathname,
  items,
  Link,
  title,
  listAriaLabel,
  emptyLabel,
  className = "",
  createAriaLabel,
  onAdd,
  getSelectedSlug,
  matchesSlug,
  getHref,
  renderSubtitle,
  avatarAlign = "center",
  highlightedId = null,
  listRef,
  listContainerProps,
}: AlphaGroupedEntitySidePanelViewProps<T>) {
  const selectedSlug = getSelectedSlug(pathname);
  const grouped = groupItemsByAlphaLetter(items);

  return (
    <ContentSidePanelShell
      title={title}
      className={className}
      headerActions={
        onAdd ? (
          <button
            type="button"
            className="app-side-panel-section-action"
            aria-label={createAriaLabel}
            onClick={onAdd}
          >
            <SidePanelPlusIcon />
          </button>
        ) : undefined
      }
      isEmpty={!items.length}
      emptyLabel={emptyLabel}
      listAriaLabel={listAriaLabel}
      listRef={listRef}
      listContainerProps={listContainerProps}
    >
      {grouped.flatMap(([letter, entries]) => [
        <li key={`group-${letter}`} className="alpha-group-header">
          <span className="alpha-group-label">{letter}</span>
        </li>,
        ...entries.map((item) => {
          const isActive = matchesSlug(item, selectedSlug);
          const href = getHref(
            getUniqueListItemRouteParam(item, items),
            pathname,
          );
          const subtitle = renderSubtitle?.(item) ?? null;
          return (
            <li key={item.id} data-keyboard-nav-item={item.id}>
              <Link
                to={href}
                className={sidePanelItemClass({
                  active: isActive,
                  keyboardHighlighted: highlightedId === item.id,
                })}
                aria-current={isActive ? "page" : undefined}
              >
                <EntityListAvatar
                  src={item.avatarSrc}
                  size={16}
                  align={avatarAlign}
                />
                {subtitle ? (
                  <span className="side-panel-item-stack">
                    <span className="app-side-panel-item-label">
                      {item.name}
                    </span>
                    {subtitle}
                  </span>
                ) : (
                  <span className="app-side-panel-item-label">{item.name}</span>
                )}
              </Link>
            </li>
          );
        }),
      ])}
    </ContentSidePanelShell>
  );
}
