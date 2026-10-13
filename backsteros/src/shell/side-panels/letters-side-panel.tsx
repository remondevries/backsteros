import {
  useCallback,
  useMemo,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  LettersSidePanelView,
  flattenGroupedListItemIds,
  getSelectedLetterSlugFromPathname,
  groupLettersByStatus,
  letterMatchesSlug,
  resolveLetterDetailHref,
  type LettersSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";

import { prefetchLetterAttachments } from "../../lib/prefetch-workspace-content";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import { RouterLink } from "../app-shell-links";

import type { SidePanelNavProps } from "./types.js";

export function DesktopLettersSidePanel({
  onNavigate,
  getLetterHref,
  title,
  ...viewProps
}: Omit<
  LettersSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "Link"
  | "collapsedKeys"
  | "onToggleCollapsed"
> &
  SidePanelNavProps) {
  const { client } = useDesktopApi();
  const { pathname, items } = viewProps;
  const resolveHref =
    getLetterHref ??
    ((letter: { id: string; number?: number | null }) =>
      resolveLetterDetailHref({
        id: letter.id,
        number: letter.number,
        listBaseHref: "/letters",
      }));
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => letterMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  // Match status-grouped visual order (not workspace list order) so j/k steps
  // to the row above/below what the user sees.
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
      onNavigate: (itemId) => {
        const item = items.find((entry) => entry.id === itemId);
        if (item) onNavigate(resolveHref(item));
      },
      enabled: itemIds.length > 0,
      prefetchItemId,
    });

  const PrefetchLink = useMemo(() => {
    return function LetterPrefetchLink({
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
      Link={PrefetchLink}
      getLetterHref={getLetterHref}
      title={title}
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
