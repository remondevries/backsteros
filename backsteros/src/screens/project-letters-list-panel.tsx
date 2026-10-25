import {
  useCallback,
  useMemo,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  LettersSidePanelView,
  flattenGroupedListItemIds,
  getSelectedLetterSlugFromPathname,
  groupLettersByStatus,
  letterMatchesSlug,
  resolveLetterDetailHref,
  type LetterListItem,
  type LettersSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { prefetchLetterAttachments } from "../lib/prefetch-workspace-content";
import { useDesktopSidePanelListNav } from "../lib/use-desktop-side-panel-list-nav";
import { navigateToHref } from "../router/navigate-href";
import { RouterLink } from "../shell/app-shell-links";

type Props = Omit<
  LettersSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "Link"
  | "collapsedKeys"
  | "onToggleCollapsed"
  | "variant"
> & {
  /** When false, unregister j/k (other sections own content). */
  keyboardEnabled: boolean;
};

/**
 * Embedded Letters list for project content — same in-pane pattern as Docs.
 */
export function DesktopProjectLettersListPanel({
  keyboardEnabled,
  getLetterHref,
  pathname,
  items,
  ...viewProps
}: Props) {
  const { client } = useDesktopApi();
  const routerNavigate = useNavigate();
  const resolveHref = useMemo(
    () =>
      getLetterHref ??
      ((letter: LetterListItem) =>
        resolveLetterDetailHref({
          id: letter.id,
          number: letter.number,
          listBaseHref: "/letters",
        })),
    [getLetterHref],
  );
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => letterMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groupLettersByStatus(items).map((group) => ({
          key: group.status,
          items: group.letters,
        })),
        collapsedKeys,
        (letter) => letter.id,
      ),
    [collapsedKeys, items],
  );

  const prefetchItemId = useCallback(
    (itemId: string) => {
      prefetchLetterAttachments(client, itemId);
    },
    [client],
  );

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      onNavigate: (itemId: string) => {
        const item = items.find((entry) => entry.id === itemId);
        if (item) {
          navigateToHref(routerNavigate, resolveHref(item));
        }
      },
      enabled: keyboardEnabled && itemIds.length > 0,
      prefetchItemId,
      zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
      pathname,
    });

  const PrefetchLink = useMemo(() => {
    return function ProjectLetterPrefetchLink({
      to,
      onMouseEnter,
      onFocus,
      ...rest
    }: {
      to: string;
      className?: string;
      children: ReactNode;
      onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
      onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
      [key: string]: unknown;
    }) {
      const href = String(to);
      const item = items.find((entry) => href === resolveHref(entry));
      return (
        <RouterLink
          to={to}
          {...rest}
          onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
            if (item) prefetchLetterAttachments(client, item.id);
            onMouseEnter?.(event);
          }}
          onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
            if (item) prefetchLetterAttachments(client, item.id);
            onFocus?.(event);
          }}
        />
      );
    };
  }, [client, items, resolveHref]);

  return (
    <LettersSidePanelView
      {...viewProps}
      pathname={pathname}
      items={items}
      variant="embedded"
      Link={PrefetchLink}
      getLetterHref={getLetterHref}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      collapsedKeys={collapsedKeys}
      onToggleCollapsed={(status) =>
        setCollapsedKeys((current) => {
          const next = new Set(current);
          if (next.has(status)) next.delete(status);
          else next.add(status);
          return next;
        })
      }
    />
  );
}
