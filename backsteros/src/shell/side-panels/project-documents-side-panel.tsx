import { useCallback, useMemo, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";

import {
  ProjectDocumentsSidePanelView,
  getSelectedProjectDocumentPathFromPathname,
  parseFolderNavId,
  type ProjectDocumentsSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";

import { prefetchKnowledgeDocumentContent } from "../../lib/prefetch-workspace-content";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import { RouterLink } from "../app-shell-links";

import type { SidePanelNavProps } from "./types.js";

export function DesktopProjectDocumentsSidePanel({
  onNavigate,
  getDocumentHref,
  ...viewProps
}: Omit<
  ProjectDocumentsSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "onVisibleNavItemIdsChange"
  | "onFolderActivateRef"
  | "getDocumentHref"
  | "Link"
> &
  SidePanelNavProps & {
    getDocumentHref: (pathOrId: string) => string;
  }) {
  const folderActivateRef = useRef<(folderId: string) => void>(() => {});
  const [navItemIds, setNavItemIds] = useState<string[]>([]);
  const { client } = useDesktopApi();
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedProjectDocumentPathFromPathname(pathname);
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
        if (item) onNavigate(getDocumentHref(item.path ?? item.id));
      },
      enabled: navItemIds.length > 0,
      prefetchItemId,
    });

  const PrefetchLink = useMemo(() => {
    return function ProjectDocPrefetchLink({
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
      const item = items.find((entry) => {
        const target = getDocumentHref(entry.path ?? entry.id);
        return href === target || href.endsWith(`/${entry.path ?? entry.id}`);
      });
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
  }, [client, getDocumentHref, items]);

  return (
    <ProjectDocumentsSidePanelView
      {...viewProps}
      Link={PrefetchLink}
      getDocumentHref={getDocumentHref}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      onVisibleNavItemIdsChange={setNavItemIds}
      onFolderActivateRef={folderActivateRef}
    />
  );
}
