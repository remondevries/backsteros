import { useCallback, useMemo, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";

import {
  KnowledgeSidePanelView,
  getKnowledgeHref,
  getSelectedKnowledgeSlugFromPathname,
  parseFolderNavId,
  type KnowledgeSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";

import { prefetchKnowledgeDocumentContent } from "../../lib/prefetch-workspace-content";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import { RouterLink } from "../app-shell-links";

import type { SidePanelNavProps } from "./types.js";

export function DesktopKnowledgeSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  KnowledgeSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "onVisibleNavItemIdsChange"
  | "onFolderActivateRef"
  | "Link"
  | "getDocumentHref"
  | "getSelectedSlugFromPathname"
  | "title"
> &
  SidePanelNavProps) {
  const folderActivateRef = useRef<(folderId: string) => void>(() => {});
  const [navItemIds, setNavItemIds] = useState<string[]>([]);
  const { client } = useDesktopApi();
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedKnowledgeSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find(
        (item) =>
          selectedSlug === item.id ||
          selectedSlug === item.path ||
          selectedSlug === (item.path ?? item.id),
      )?.id ?? null)
    : null;

  const prefetchItemId = useCallback(
    (itemId: string) => {
      if (parseFolderNavId(itemId) !== null) return;
      prefetchKnowledgeDocumentContent(client, itemId);
    },
    [client],
  );

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds: navItemIds,
      selectedId,
      onNavigate: (itemId) => {
        const folderId = parseFolderNavId(itemId);
        if (folderId !== null) {
          folderActivateRef.current(folderId);
          return;
        }
        const item = items.find((entry) => entry.id === itemId);
        if (item) onNavigate(getKnowledgeHref(item.path ?? item.id));
      },
      enabled: navItemIds.length > 0,
      prefetchItemId,
    });

  const PrefetchLink = useMemo(() => {
    return function KnowledgePrefetchLink({
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
      const slug = String(to).replace(/^\/knowledge\/?/, "");
      const item = items.find(
        (entry) =>
          slug === entry.id ||
          slug === entry.path ||
          slug === (entry.path ?? entry.id) ||
          decodeURIComponent(slug) === entry.path,
      );
      return (
        <RouterLink
          to={to}
          {...rest}
          onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
            if (item) prefetchKnowledgeDocumentContent(client, item.id);
            onMouseEnter?.(event);
          }}
          onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
            if (item) prefetchKnowledgeDocumentContent(client, item.id);
            onFocus?.(event);
          }}
        />
      );
    };
  }, [client, items]);

  return (
    <KnowledgeSidePanelView
      {...viewProps}
      title="Knowledge Base"
      getDocumentHref={getKnowledgeHref}
      getSelectedSlugFromPathname={getSelectedKnowledgeSlugFromPathname}
      Link={PrefetchLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      onVisibleNavItemIdsChange={setNavItemIds}
      onFolderActivateRef={folderActivateRef}
    />
  );
}
