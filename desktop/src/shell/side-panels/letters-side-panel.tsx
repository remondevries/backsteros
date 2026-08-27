import { useCallback, useMemo, type FocusEvent, type MouseEvent, type ReactNode } from "react";

import {
  LettersSidePanelView,
  getLettersHref,
  getSelectedLetterSlugFromPathname,
  letterMatchesSlug,
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
  "highlightedId" | "listRef" | "listContainerProps" | "Link"
> &
  SidePanelNavProps) {
  const { client } = useDesktopApi();
  const { pathname, items } = viewProps;
  const resolveHref =
    getLetterHref ?? ((letter: { number: number }) => getLettersHref(letter.number));
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => letterMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;

  const prefetchItemId = useCallback(
    (itemId: string) => {
      prefetchLetterAttachments(client, itemId);
    },
    [client],
  );

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds: items.map((item) => item.id),
      selectedId,
      onNavigate: (itemId) => {
        const item = items.find((entry) => entry.id === itemId);
        if (item) onNavigate(resolveHref(item));
      },
      enabled: items.length > 0,
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
    />
  );
}
