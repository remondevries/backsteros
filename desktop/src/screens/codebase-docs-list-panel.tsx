import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  ProjectDocumentsSidePanelView,
  getSelectedProjectDocumentPathFromPathname,
  parseFolderNavId,
  type KnowledgeListItem,
  type ProjectDocumentsSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { prefetchKnowledgeDocumentContent } from "../lib/prefetch-workspace-content";
import { useDesktopSidePanelListNav } from "../lib/use-desktop-side-panel-list-nav";
import { navigateToHref } from "../router/navigate-href";
import { RouterLink } from "../shell/app-shell-links";
import { useNavigate } from "@tanstack/react-router";

type Props = Omit<
  ProjectDocumentsSidePanelViewProps,
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "onVisibleNavItemIdsChange"
  | "onFolderActivateRef"
  | "Link"
  | "variant"
> & {
  /** When false, unregister j/k (other workbench tabs own content). */
  keyboardEnabled: boolean;
};

/**
 * Embedded Docs tree for codebase workbench — content-zone j/k + Tab with the
 * document editor (same zone as the Files tree).
 */
export function DesktopCodebaseDocsListPanel({
  keyboardEnabled,
  getDocumentHref,
  pathname,
  items,
  ...viewProps
}: Props) {
  const folderActivateRef = useRef<(folderId: string) => void>(() => {});
  const [navItemIds, setNavItemIds] = useState<string[]>([]);
  const { client } = useDesktopApi();
  const routerNavigate = useNavigate();
  const selectedSlug = getSelectedProjectDocumentPathFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find(
        (item: KnowledgeListItem) =>
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
      onNavigate: (itemId: string) => {
        const folderId = parseFolderNavId(itemId);
        if (folderId !== null) {
          folderActivateRef.current(folderId);
          return;
        }
        const item = items.find((entry) => entry.id === itemId);
        if (item) {
          navigateToHref(
            routerNavigate,
            getDocumentHref(item.path ?? item.id),
          );
        }
      },
      enabled: keyboardEnabled && navItemIds.length > 0,
      prefetchItemId,
      zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
      pathname,
    });

  const PrefetchLink = useMemo(() => {
    return function CodebaseDocPrefetchLink({
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
      pathname={pathname}
      items={items}
      variant="embedded"
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
