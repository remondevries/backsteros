import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import {
  ChromeHeaderProvider,
  ClientLinkProvider,
  MentionNavigationProvider,
  CommandPaletteProvider,
  CommandPaletteView,
  ComposeModal,
  ContactsSidePanelView,
  EntityHeaderActionsShell,
  HistoryEntryIcon,
  InboxSidePanelView,
  JournalSidePanelView,
  KnowledgeSidePanelView,
  LettersSidePanelView,
  ListKeyboardNavigationProvider,
  MentionCatalogProvider,
  OrganizationsSidePanelView,
  ProductAppShell,
  ProductSidebar,
  ProjectDocumentsSidePanelView,
  ResizableContextPanel,
  SettingsSidePanelNavView,
  BreadcrumbChromeSkeleton,
  buildDocumentFoldersByTarget,
  buildDocumentTree,
  buildProjectDropdownOptions,
  contactMatchesSlug,
  findDocumentTreeNodeById,
  findInboxItemBySlugOrId,
  getContactsHref,
  getContactSidePanelHref,
  getContentSidePanelWidthKey,
  getInboxItemHref,
  getInboxTaskRouteHref,
  getJournalHref,
  getKnowledgeHref,
  getLettersHref,
  getOrganizationsHref,
  getOrganizationSidePanelHref,
  getProjectDocumentHref,
  getProjectRouteParamFromPathname,
  getProjectRouteScopeFromPathname,
  getScopedProjectDocumentHref,
  getScopedProjectLetterHref,
  getScopedProjectTaskHref,
  getSelectedContactSlugFromPathname,
  getSelectedInboxSlugFromPathname,
  getSelectedJournalDateFromPathname,
  getSelectedKnowledgeSlugFromPathname,
  getSelectedLetterSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
  getSelectedProjectDocumentPathFromPathname,
  getUniqueListItemRouteParam,
  type ClientLinkProps,
  getTodayJournalDateSlug,
  groupItemsByAlphaLetter,
  isContactSectionPath,
  isInboxPath,
  isJournalSectionPath,
  isKnowledgeSectionPath,
  isLettersSectionPath,
  isOrganizationSectionPath,
  isProjectDocumentsSectionPath,
  isProjectLettersSectionPath,
  isSettingsPath,
  letterMatchesSlug,
  organizationMatchesSlug,
  parseFolderNavId,
  parseNavigationTrailPath,
  resolveHistoryEntryDisplay,
  shouldHandleGlobalShortcut,
  shouldShowContentSidePanel,
  syncActiveTabToPath,
  useBlockBrowserTabFocus,
  useChromeHeader,
  useCommandPalette,
  useComposeShortcut,
  useContentSidePanelToggleShortcut,
  useDocumentTreeCreateFolderShortcut,
  useEscapeBackNavigation,
  useListBoardViewShortcuts,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useNavigationHistory,
  RegisterPageTitleProvider,
  useNavigationShortcuts,
  useSectionTabShortcuts,
  useSettingsShortcut,
  useTabShortcuts,
  useTaskPropertyDropdownShortcuts,
  useContentPreviewScrollShortcuts,
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  createDefaultTabsState,
  createProductTab,
  formatLastSyncedAt,
  type ContactsSidePanelViewProps,
  type InboxSidePanelViewProps,
  type JournalSidePanelViewProps,
  type KnowledgeSidePanelViewProps,
  type LettersSidePanelViewProps,
  type OrganizationsSidePanelViewProps,
  type ProductSidebarRecentPage,
  type ProjectDocumentsSidePanelViewProps,
  type ProductTabsState,
  type TreeReorderRequest,
} from "@backsteros/ui";
import { useClerk } from "@clerk/clerk-react";

import { useDesktopApi } from "../lib/api-context";
import { useCommandPaletteSearchFn } from "../lib/command-palette-search";
import { getDefaultAssigneeId } from "../lib/default-assignee";
import { getDesktopPublicEnvironment } from "../lib/env";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import {
  prefetchJournalEntryContent,
  prefetchKnowledgeDocumentContent,
  prefetchLetterAttachments,
  warmTodayJournalEntry,
} from "../lib/prefetch-workspace-content";
import {
  JournalSelectionProvider,
  useJournalSelection,
} from "../lib/journal-selection-context";
import { useDesktopPowerSync } from "../lib/powersync-context";
import { useDesktopResource } from "../lib/use-desktop-resource";
import { buildMentionCatalogFromWorkspace } from "../lib/mention-catalog";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useComposeGlobalShortcut } from "../lib/use-compose-global-shortcut";
import { useCommandPaletteGlobalShortcut } from "../lib/use-command-palette-global-shortcut";
import { DesktopOverlayMainNavigationListener } from "../components/desktop-overlay-main-navigation-listener";

const TABS_STORAGE_KEY = "backsteros.desktop.app-tabs";

function RouterLink({
  to,
  className,
  children,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onFocus,
  onPointerDown,
  title,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: (event?: MouseEvent<HTMLAnchorElement>) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLAnchorElement>) => void;
  title?: string;
  "aria-current"?: "page";
  [key: string]: unknown;
}) {
  return (
    <NavLink
      to={to}
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      title={title}
      aria-current={rest["aria-current"] as "page" | undefined}
      {...rest}
    >
      {children as never}
    </NavLink>
  );
}

const DesktopClientLink = forwardRef<HTMLAnchorElement, ClientLinkProps>(
  function DesktopClientLink(
    { href, className, title, children, ...rest },
    ref,
  ) {
    // Duplicate @types/react in the monorepo (Expo 19.0 vs desktop 19.1+) makes
    // React Router's Link props incompatible with AnchorHTMLAttributes — cast.
    return (
      <Link
        ref={ref}
        to={href}
        className={className}
        title={title}
        {...(rest as object)}
      >
        {children as never}
      </Link>
    );
  },
);

type SidePanelNavProps = { onNavigate: (href: string) => void };

function DesktopInboxSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  InboxSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedInboxSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (findInboxItemBySlugOrId(items, selectedSlug)?.id ?? null)
    : null;
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: items.map((item) => item.id),
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) onNavigate(getInboxItemHref(item, items));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: items.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <InboxSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

function DesktopJournalSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  JournalSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps" | "Link"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { client } = useDesktopApi();
  const { selectDate } = useJournalSelection();
  const workspace = useDesktopWorkspaceData();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const resource = useDesktopResource<{
    documents: Array<{ journalDate?: string | null }>;
  }>((client) => client.requestJson("/api/v1/documents?type=journal"));
  const { pathname } = viewProps;
  const items = useMemo(() => {
    if (viewProps.items.length > 0) return viewProps.items;
    const dates =
      resource.data?.documents
        .map((document) => document.journalDate)
        .filter((date): date is string => Boolean(date)) ?? [];
    return [...new Set(dates)]
      .sort((a, b) => b.localeCompare(a))
      .map((dateSlug) => ({ dateSlug }));
  }, [resource.data, viewProps.items]);
  const selectedId = getSelectedJournalDateFromPathname(pathname) ?? null;
  const itemIds = useMemo(
    () => items.map((item) => item.dateSlug),
    [items],
  );
  const documentIdByDateRef = useRef(workspace.journalDocumentIdsByDate);
  documentIdByDateRef.current = workspace.journalDocumentIdsByDate;

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (dateSlug) => {
      selectDate(dateSlug);
      onNavigate(getJournalHref(dateSlug));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: items.length > 0,
  });

  // Stable like Knowledge: only `[client]` — the date→id map is read via ref so
  // workspace re-renders don't re-fire prefetch on every j/k highlight.
  const prefetchItemId = useCallback(
    (dateSlug: string) => {
      prefetchJournalEntryContent(client, {
        dateSlug,
        documentIdByDate: documentIdByDateRef.current,
      });
    },
    [client],
  );

  useEffect(() => {
    if (highlightedId) prefetchItemId(highlightedId);
  }, [highlightedId, prefetchItemId]);

  const PrefetchLink = useMemo(() => {
    return function JournalPrefetchLink({
      to,
      onMouseEnter,
      onFocus,
      onClick,
      ...rest
    }: {
      to: string;
      className?: string;
      children: ReactNode;
      onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
      onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
      onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
      [key: string]: unknown;
    }) {
      const dateSlug = String(to).replace(/^\/journal\/?/, "");
      return (
        <RouterLink
          to={to}
          {...rest}
          onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
            if (dateSlug) prefetchItemId(dateSlug);
            onMouseEnter?.(event);
          }}
          onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
            if (dateSlug) prefetchItemId(dateSlug);
            onFocus?.(event);
          }}
          onPointerDown={() => {
            // Paint skeleton on press — before click/navigation settles.
            if (dateSlug) selectDate(dateSlug);
          }}
          onClick={() => {
            if (dateSlug) selectDate(dateSlug);
            onClick?.({} as MouseEvent<HTMLAnchorElement>);
          }}
        />
      );
    };
  }, [prefetchItemId, selectDate]);

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <JournalSidePanelView
      {...viewProps}
      items={items}
      Link={PrefetchLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      createTodayDisabled={isCreating}
      createTodayError={createError}
      onCreateToday={() => {
        const todaySlug = getTodayJournalDateSlug();
        setIsCreating(true);
        setCreateError(null);
        selectDate(todaySlug);
        void (async () => {
          try {
            await client.requestJson(
              `/api/v1/journal/${encodeURIComponent(todaySlug)}`,
            );
            resource.reload();
            onNavigate(getJournalHref(todaySlug));
          } catch (error) {
            setCreateError(
              error instanceof Error
                ? error.message
                : "Could not open today's journal.",
            );
          } finally {
            setIsCreating(false);
          }
        })();
      }}
    />
  );
}

function DesktopKnowledgeSidePanel({
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
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
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

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
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
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: navItemIds.length > 0,
  });

  useEffect(() => {
    if (highlightedId) prefetchItemId(highlightedId);
  }, [highlightedId, prefetchItemId]);

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

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <KnowledgeSidePanelView
      {...viewProps}
      Link={PrefetchLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      onVisibleNavItemIdsChange={setNavItemIds}
      onFolderActivateRef={folderActivateRef}
    />
  );
}

function DesktopLettersSidePanel({
  onNavigate,
  getLetterHref,
  ...viewProps
}: Omit<
  LettersSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps" | "Link"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { client } = useDesktopApi();
  const { pathname, items } = viewProps;
  const resolveHref =
    getLetterHref ?? ((letter: { number: number }) => getLettersHref(letter.number));
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => letterMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: items.map((item) => item.id),
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) onNavigate(resolveHref(item));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: items.length > 0,
  });

  useEffect(() => {
    if (highlightedId) prefetchLetterAttachments(client, highlightedId);
  }, [client, highlightedId]);

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

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <LettersSidePanelView
      {...viewProps}
      Link={PrefetchLink}
      getLetterHref={getLetterHref}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

function DesktopProjectDocumentsSidePanel({
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
  const listRef = useRef<HTMLElement>(null);
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

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
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
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: navItemIds.length > 0,
  });

  useEffect(() => {
    if (highlightedId) prefetchItemId(highlightedId);
  }, [highlightedId, prefetchItemId]);

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

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
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

function DesktopContactsSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  ContactsSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedContactSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => contactMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;
  // Match DOM order from alpha-grouped rendering so j/k follows the visible list.
  const itemIds = groupItemsByAlphaLetter(items).flatMap(([, entries]) =>
    entries.map((item) => item.id),
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) {
        onNavigate(
          getContactSidePanelHref(
            getUniqueListItemRouteParam(item, items),
            pathname,
          ),
        );
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: items.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <ContactsSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

function DesktopOrganizationsSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  OrganizationsSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedOrganizationSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => organizationMatchesSlug(item, selectedSlug))?.id ??
      null)
    : null;
  // Match DOM order from alpha-grouped rendering so j/k follows the visible list.
  const itemIds = groupItemsByAlphaLetter(items).flatMap(([, entries]) =>
    entries.map((item) => item.id),
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) {
        onNavigate(
          getOrganizationSidePanelHref(
            getUniqueListItemRouteParam(item, items),
            pathname,
          ),
        );
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: items.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <OrganizationsSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

function loadTabsState(pathname: string): ProductTabsState {
  if (typeof window === "undefined") {
    return createDefaultTabsState(pathname);
  }
  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) {
      return createDefaultTabsState(pathname);
    }
    const parsed = JSON.parse(raw) as ProductTabsState;
    if (!parsed.tabs?.length || !parsed.activeTabId) {
      return createDefaultTabsState(pathname);
    }
    return syncActiveTabToPath(parsed, pathname);
  } catch {
    return createDefaultTabsState(pathname);
  }
}

/** Renders children only when Clerk is configured (safe to call useClerk). */
function DesktopClerkProfileBridge({
  children,
}: {
  children: (actions: {
    onAccount?: () => void;
    onSignOut?: () => void;
  }) => ReactNode;
}) {
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  if (!clerkKey) {
    return <>{children({})}</>;
  }
  return (
    <DesktopClerkProfileBridgeInner>{children}</DesktopClerkProfileBridgeInner>
  );
}

function DesktopClerkProfileBridgeInner({
  children,
}: {
  children: (actions: {
    onAccount?: () => void;
    onSignOut?: () => void;
  }) => ReactNode;
}) {
  const { openUserProfile, signOut } = useClerk();
  return (
    <>
      {children({
        onAccount: () => {
          openUserProfile();
        },
        onSignOut: () => {
          void signOut();
        },
      })}
    </>
  );
}

function AppShellInner({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: commandPaletteOpen, openSearch, openGo, setOpen, mode } =
    useCommandPalette();
  const searchFn = useCommandPaletteSearchFn();
  const chromeHeader = useChromeHeader();
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const sync = useDesktopPowerSync();
  const settingsPage = isSettingsPath(location.pathname);
  const [tabsState, setTabsState] = useState<ProductTabsState>(() =>
    loadTabsState(location.pathname),
  );
  const [composeOpen, setComposeOpen] = useState(false);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  // Warm today's journal as soon as workspace metadata is ready so the first
  // nav to Journal is a cache hit (same class of work Knowledge already skips).
  const todayJournalSlug = getTodayJournalDateSlug();
  const todayJournalDocumentId =
    workspace.journalDocumentIdsByDate[todayJournalSlug] ?? null;
  useEffect(() => {
    if (!workspace.ready) return;
    warmTodayJournalEntry(client, {
      dateSlug: todayJournalSlug,
      documentId: todayJournalDocumentId,
    });
  }, [client, todayJournalDocumentId, todayJournalSlug, workspace.ready]);

  useEffect(() => {
    const stored = localStorage.getItem("backsteros:sidebar-visible");
    if (stored === null) return;
    const frame = requestAnimationFrame(() =>
      setSidebarCollapsed(stored === "false"),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("backsteros:sidebar-visible", String(!next));
      return next;
    });
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "[") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }
      event.preventDefault();
      toggleSidebarCollapsed();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [toggleSidebarCollapsed]);

  const closePalette = useCallback(() => setOpen(false), [setOpen]);
  const navigateTo = useCallback(
    (href: string) => {
      navigate(href);
    },
    [navigate],
  );

  const history = useNavigationHistory({
    pathname: location.pathname,
    search: location.search,
    onNavigate: navigateTo,
  });

  const updateActiveTabTitle = useCallback((title: string) => {
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, title } : tab,
      ),
    }));
  }, []);
  const updateActiveTabIcon = useCallback((icon: string | null) => {
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, icon } : tab,
      ),
    }));
  }, []);

  useComposeShortcut({
    enabled: true,
    commandPaletteOpen,
    onCompose: () => setComposeOpen(true),
  });

  useComposeGlobalShortcut({
    enabled: true,
    commandPaletteOpen,
    onCompose: () => setComposeOpen(true),
  });

  useCommandPaletteGlobalShortcut({
    enabled: true,
    onOpenPalette: openSearch,
  });

  useNavigationShortcuts({
    enabled: true,
    commandPaletteOpen,
    commandPaletteMode: mode,
    openGo,
    closePalette,
    onNavigate: navigateTo,
  });

  useSettingsShortcut({
    enabled: true,
    commandPaletteOpen,
    closePalette,
    onNavigate: navigateTo,
  });

  useSectionTabShortcuts({
    enabled: true,
    pathname: location.pathname,
    search: location.search,
    commandPaletteOpen,
    onNavigate: navigateTo,
  });

  useListBoardViewShortcuts({
    enabled: true,
    pathname: location.pathname,
    search: location.search,
    commandPaletteOpen,
    onNavigate: navigateTo,
  });

  useTaskPropertyDropdownShortcuts({
    commandPaletteOpen,
    pathname: location.pathname,
  });

  useContentPreviewScrollShortcuts();
  useBlockBrowserTabFocus({ enabled: true });

  useEscapeBackNavigation({
    enabled: true,
    pathname: location.pathname,
    commandPaletteOpen,
    canGoBack: history.canGoBack,
    onGoBack: history.goBack,
  });

  const composeProjects = useMemo(
    () =>
      workspace.projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        icon: project.icon ?? null,
        color: null,
        dueDate: project.dueDate ? new Date(project.dueDate) : null,
      })),
    [workspace.projects],
  );

  const paletteEntityNames = useMemo(() => {
    const projectParam = getProjectRouteParamFromPathname(location.pathname);
    const project = projectParam
      ? workspace.projects.find(
          (entry) =>
            entry.key.toLowerCase() === projectParam.toLowerCase() ||
            entry.id === projectParam,
        )
      : null;
    const contactSlug = getSelectedContactSlugFromPathname(location.pathname);
    const contact = contactSlug
      ? workspace.contacts.find((entry) =>
          contactMatchesSlug(entry, contactSlug),
        )
      : null;
    const orgSlug = getSelectedOrganizationSlugFromPathname(location.pathname);
    const organization = orgSlug
      ? workspace.organizations.find((entry) =>
          organizationMatchesSlug(entry, orgSlug),
        )
      : null;
    return {
      projectName: project?.name ?? null,
      contactName: contact?.name ?? null,
      organizationName: organization?.name ?? null,
    };
  }, [
    location.pathname,
    workspace.contacts,
    workspace.organizations,
    workspace.projects,
  ]);

  const resolvePaletteContextIds = useCallback(
    (context: {
      kind: string;
      projectRouteParam?: string;
      contactRouteParam?: string;
      organizationRouteParam?: string;
    } | null) => {
      if (!context) {
        return {
          projectId: null as string | null,
          contactId: null as string | null,
          organizationId: null as string | null,
        };
      }
      if (context.kind === "project" && context.projectRouteParam) {
        const project = workspace.projects.find(
          (entry) =>
            entry.key.toLowerCase() ===
              context.projectRouteParam!.toLowerCase() ||
            entry.id === context.projectRouteParam,
        );
        return {
          projectId: project?.id ?? null,
          contactId: null,
          organizationId: null,
        };
      }
      if (context.kind === "contact" && context.contactRouteParam) {
        const contact = workspace.contacts.find((entry) =>
          contactMatchesSlug(entry, context.contactRouteParam!),
        );
        return {
          projectId: null,
          contactId: contact?.id ?? null,
          organizationId: null,
        };
      }
      if (context.kind === "organization" && context.organizationRouteParam) {
        const organization = workspace.organizations.find((entry) =>
          organizationMatchesSlug(entry, context.organizationRouteParam!),
        );
        return {
          projectId: null,
          contactId: null,
          organizationId: organization?.id ?? null,
        };
      }
      return { projectId: null, contactId: null, organizationId: null };
    },
    [workspace.contacts, workspace.organizations, workspace.projects],
  );

  const composeContacts = useMemo(
    () => withAvatarSrc(workspace.contacts, contactAvatarSrc),
    [contactAvatarSrc, workspace.contacts],
  );

  const sidePanelOrganizations = useMemo(
    () => withAvatarSrc(workspace.organizations, organizationAvatarSrc),
    [organizationAvatarSrc, workspace.organizations],
  );

  const documentFoldersByTarget = useMemo(
    () =>
      buildDocumentFoldersByTarget(
        [
          ...workspace.knowledgeDocuments.map((document) => ({
            path: document.path ?? "",
            title: document.title,
            kind: document.kind ?? "document",
            type: "knowledge",
            projectId: null,
          })),
          ...workspace.projectDocuments.map((document) => ({
            path: document.path ?? "",
            title: document.title,
            kind: document.kind ?? "document",
            type: "project",
            projectId: document.projectId ?? null,
          })),
        ],
        workspace.projects,
        COMPOSE_KNOWLEDGE_BASE_VALUE,
      ),
    [
      workspace.knowledgeDocuments,
      workspace.projectDocuments,
      workspace.projects,
    ],
  );

  const mentionCatalog = useMemo(
    () => buildMentionCatalogFromWorkspace(workspace),
    [
      workspace.contacts,
      workspace.inboxItems,
      workspace.knowledgeDocuments,
      workspace.organizations,
      workspace.projectDocuments,
      workspace.projectSummaries,
      workspace.projects,
      workspace.tasks,
    ],
  );

  useEffect(() => {
    setTabsState((current) => syncActiveTabToPath(current, location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsState));
  }, [tabsState]);

  const activateTab = useCallback(
    (tabId: string) => {
      const tab = tabsState.tabs.find((entry) => entry.id === tabId);
      if (!tab) return;
      setTabsState((current) => ({ ...current, activeTabId: tabId }));
      if (tab.href !== location.pathname) {
        navigate(tab.href);
      }
    },
    [location.pathname, navigate, tabsState.tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabsState((current) => {
        if (current.tabs.length <= 1) {
          return current;
        }
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) {
          return current;
        }
        const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
        const closingActive = current.activeTabId === tabId;
        const nextActive =
          closingActive
            ? (nextTabs[Math.max(0, index - 1)] ?? nextTabs[0])!
            : current.tabs.find((tab) => tab.id === current.activeTabId)!;
        if (closingActive) {
          queueMicrotask(() => navigate(nextActive.href));
        }
        return {
          tabs: nextTabs,
          activeTabId: closingActive ? nextActive.id : current.activeTabId,
        };
      });
    },
    [navigate],
  );

  const openNewTab = useCallback(() => {
    const tab = createProductTab("/inbox");
    setTabsState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
    }));
    navigate(tab.href);
  }, [navigate]);

  const activatePreviousTab = useCallback(() => {
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const previous =
        current.tabs[(index - 1 + current.tabs.length) % current.tabs.length]!;
      queueMicrotask(() => navigate(previous.href));
      return { ...current, activeTabId: previous.id };
    });
  }, [navigate]);

  const activateNextTab = useCallback(() => {
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const next = current.tabs[(index + 1) % current.tabs.length]!;
      queueMicrotask(() => navigate(next.href));
      return { ...current, activeTabId: next.id };
    });
  }, [navigate]);

  useTabShortcuts({
    enabled: true,
    activeTabId: tabsState.activeTabId,
    openNewTab,
    closeTab,
    activatePreviousTab,
    activateNextTab,
  });

  const pathname = location.pathname;
  const navigationTrail = parseNavigationTrailPath(pathname);
  const panelPathname = navigationTrail?.sourceHref ?? pathname;
  const showSidePanel =
    !settingsPage && shouldShowContentSidePanel(panelPathname);

  useContentSidePanelToggleShortcut({
    enabled: showSidePanel,
    onToggle: () => setSidePanelCollapsed((current) => !current),
  });

  useDocumentTreeCreateFolderShortcut({
    pathname: panelPathname,
    enabled: true,
  });

  const projectRouteParam = getProjectRouteParamFromPathname(panelPathname);
  const projectRouteScope = getProjectRouteScopeFromPathname(panelPathname);
  const activeProject = projectRouteParam
    ? workspace.projects.find(
        (project) =>
          project.id === projectRouteParam ||
          project.key.toLowerCase() === projectRouteParam.toLowerCase(),
      ) ?? null
    : null;

  const projectDocumentsForPanel = useMemo(() => {
    if (!activeProject) return [];
    return workspace.projectDocuments.filter(
      (document) => document.projectId === activeProject.id,
    );
  }, [activeProject, workspace.projectDocuments]);

  const projectLettersForPanel = useMemo(() => {
    if (!activeProject) return [];
    return workspace.letters.filter(
      (letter) =>
        letter.projectId === activeProject.id ||
        (letter.projectKey &&
          letter.projectKey.toLowerCase() === activeProject.key.toLowerCase()),
    );
  }, [activeProject, workspace.letters]);

  let sidePanelBody: ReactNode = null;
  if (showSidePanel) {
    if (isInboxPath(panelPathname)) {
      sidePanelBody = (
        <DesktopInboxSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.inboxItems}
          loading={!workspace.ready}
          Link={RouterLink}
          onCreateTask={(title) => workspace.createInboxTask({ title })}
          onCreatedTask={(taskId) => {
            const item = workspace.inboxItems.find(
              (entry) => entry.id === taskId && entry.kind === "task",
            );
            if (item && item.kind === "task" && item.number != null) {
              navigate(getInboxTaskRouteHref({ number: item.number }));
              return;
            }
            navigate(`/inbox/${taskId}`);
          }}
          projectOptions={buildProjectDropdownOptions(
            workspace.projects.map((project) => ({
              key: project.key,
              name: project.name,
              icon: project.icon,
            })),
            {
              includeNone: true,
            },
          )}
          onPriorityChange={(taskId, priority) => {
            void workspace.patchTask(taskId, { priority });
          }}
          onDueDateChange={(taskId, dueDate) => {
            void workspace.patchTask(taskId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onProjectChange={(taskId, projectKey) => {
            const project = projectKey
              ? workspace.projects.find((entry) => entry.key === projectKey) ??
                null
              : null;
            void workspace.patchTask(taskId, {
              projectId: project?.id ?? null,
            });
          }}
        />
      );
    } else if (isJournalSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopJournalSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.journalItems}
        />
      );
    } else if (isKnowledgeSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopKnowledgeSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.knowledgeDocuments}
          loading={!workspace.ready}
          onAdd={(parentFolderId) => {
            void workspace
              .createKnowledgeDocument({
                title: "Untitled",
                parentId: parentFolderId,
              })
              .then((created) => {
                navigate(getKnowledgeHref(created.path || created.id));
              });
          }}
          onCreateFolder={async ({ title, parentId }) => {
            try {
              await workspace.createKnowledgeFolder({ title, parentId });
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not create folder.",
              };
            }
          }}
          onRename={(id, title) => workspace.renameDocument(id, title)}
          onDelete={(id) => workspace.deleteDocument(id)}
          onReorderTreeItem={(request: TreeReorderRequest) => {
            const tree = buildDocumentTree(
              workspace.knowledgeDocuments.map((item) => ({
                id: item.id,
                title: item.title,
                path: item.path ?? item.id,
                kind:
                  item.kind === "folder"
                    ? ("folder" as const)
                    : ("document" as const),
                parentId: item.parentId ?? null,
                sortOrder: item.sortOrder ?? 0,
                icon: item.icon ?? null,
              })),
            );
            void (async () => {
              if (request.fromParentId !== request.toParentId) {
                await workspace.moveDocument(
                  request.itemId,
                  request.toParentId,
                );
                return;
              }
              const parent =
                request.toParentId === null
                  ? null
                  : findDocumentTreeNodeById(tree, request.toParentId);
              const siblings =
                parent === null
                  ? tree
                  : parent.type === "folder"
                    ? parent.children
                    : [];
              const ids = siblings
                .filter((node) => node.id !== request.itemId)
                .map((node) => node.id);
              const insertAt = request.beforeId
                ? ids.indexOf(request.beforeId)
                : -1;
              if (insertAt === -1) ids.push(request.itemId);
              else ids.splice(insertAt, 0, request.itemId);
              await workspace.reorderDocuments(ids);
            })();
          }}
        />
      );
    } else if (isProjectDocumentsSectionPath(panelPathname) && activeProject) {
      const projectKey = activeProject.key;
      sidePanelBody = (
        <DesktopProjectDocumentsSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={projectDocumentsForPanel}
          getDocumentHref={(pathOrId) =>
            getScopedProjectDocumentHref(projectKey, pathOrId, projectRouteScope)
          }
          onAdd={(parentFolderId) => {
            void workspace
              .createProjectDocument({
                projectId: activeProject.id,
                title: "Untitled",
                parentId: parentFolderId,
              })
              .then((created) => {
                navigate(
                  getScopedProjectDocumentHref(
                    projectKey,
                    created.path || created.id,
                    projectRouteScope,
                  ),
                );
              });
          }}
          onCreateFolder={async ({ title, parentId }) => {
            try {
              await workspace.createProjectFolder({
                projectId: activeProject.id,
                title,
                parentId,
              });
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not create folder.",
              };
            }
          }}
          onRename={(id, title) => workspace.renameDocument(id, title)}
          onDelete={(id) => workspace.deleteDocument(id)}
          onReorderTreeItem={(request: TreeReorderRequest) => {
            const tree = buildDocumentTree(
              projectDocumentsForPanel.map((item) => ({
                id: item.id,
                title: item.title,
                path: item.path ?? item.id,
                kind:
                  item.kind === "folder"
                    ? ("folder" as const)
                    : ("document" as const),
                parentId: item.parentId ?? null,
                sortOrder: item.sortOrder ?? 0,
                icon: item.icon ?? null,
              })),
            );
            void (async () => {
              if (request.fromParentId !== request.toParentId) {
                await workspace.moveDocument(
                  request.itemId,
                  request.toParentId,
                );
                return;
              }
              const parent =
                request.toParentId === null
                  ? null
                  : findDocumentTreeNodeById(tree, request.toParentId);
              const siblings =
                parent === null
                  ? tree
                  : parent.type === "folder"
                    ? parent.children
                    : [];
              const ids = siblings
                .filter((node) => node.id !== request.itemId)
                .map((node) => node.id);
              const insertAt = request.beforeId
                ? ids.indexOf(request.beforeId)
                : -1;
              if (insertAt === -1) ids.push(request.itemId);
              else ids.splice(insertAt, 0, request.itemId);
              await workspace.reorderDocuments(ids);
            })();
          }}
        />
      );
    } else if (isProjectLettersSectionPath(panelPathname) && activeProject) {
      const projectKey = activeProject.key;
      sidePanelBody = (
        <DesktopLettersSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={projectLettersForPanel}
          loading={!workspace.ready}
          composeHref={getScopedProjectLetterHref(
            projectKey,
            "new",
            projectRouteScope,
          )}
          getLetterHref={(letter) =>
            getScopedProjectLetterHref(projectKey, letter.number, projectRouteScope)
          }
        />
      );
    } else if (isLettersSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopLettersSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.letters}
          loading={!workspace.ready}
        />
      );
    } else if (isContactSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopContactsSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={composeContacts}
          Link={RouterLink}
          onAdd={() => {
            void workspace
              .createContact({ name: "New contact" })
              .then((created) => {
                navigate(getContactsHref(created.id));
              });
          }}
        />
      );
    } else if (isOrganizationSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopOrganizationsSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={sidePanelOrganizations}
          Link={RouterLink}
          onAdd={() => {
            void workspace
              .createOrganization({ name: "New organization" })
              .then((created) => {
                navigate(getOrganizationsHref(created.id));
              });
          }}
        />
      );
    }
  }

  const sidePanel =
    showSidePanel && sidePanelBody ? (
      <ResizableContextPanel
        storageKey={getContentSidePanelWidthKey(panelPathname)}
      >
        {sidePanelBody}
      </ResizableContextPanel>
    ) : undefined;

  const syncInProgress =
    sync.connecting || Boolean(sync.connected && !sync.lastSyncedAt);

  const sidebar = settingsPage ? (
    <SettingsSidePanelNavView
      pathname={pathname}
      Link={RouterLink}
      onBack={() => navigate("/inbox")}
    />
  ) : (
    <DesktopClerkProfileBridge>
      {({ onAccount, onSignOut }) => (
        <ProductSidebar
          pathname={pathname}
          Link={RouterLink}
          onBack={history.goBack}
          onForward={history.goForward}
          canGoBack={history.canGoBack}
          canGoForward={history.canGoForward}
          onSearch={openSearch}
          recentPages={history.recentPages.map((page): ProductSidebarRecentPage => {
            const display = resolveHistoryEntryDisplay(page.href, page.title);
            return {
              id: page.href,
              href: page.href,
              title: display.title,
              badge: display.badgeLabel,
              icon: createElement(HistoryEntryIcon, {
                display,
                icon: page.icon,
              }),
            };
          })}
          onSelectRecentPage={(href) => history.navigateToHistoryEntry(href)}
          onCompose={() => {
            setComposeOpen(true);
          }}
          onSyncNow={() => void sync.retry()}
          syncInProgress={syncInProgress}
          syncOffline={sync.offline || Boolean(sync.error)}
          syncStatusLabel={
            sync.offline
              ? "Offline"
              : sync.error
                ? "Retry sync"
                : syncInProgress
                  ? "Syncing…"
                  : sync.connected
                    ? "Sync now"
                    : "Connect sync"
          }
          syncTitle={
            sync.error?.message ??
            (sync.lastSyncedAt
              ? `Last sync ${sync.lastSyncedAt.toLocaleString()}`
              : "Waiting for first sync")
          }
          lastSyncLabel={
            sync.lastSyncedAt
              ? formatLastSyncedAt(sync.lastSyncedAt)
              : sync.connecting
                ? null
                : "Never"
          }
          onAccount={onAccount}
          onSignOut={onSignOut}
        />
      )}
    </DesktopClerkProfileBridge>
  );

  return (
    <ClientLinkProvider Link={DesktopClientLink}>
    <MentionNavigationProvider pathname={location.pathname}>
    <MentionCatalogProvider catalog={mentionCatalog}>
    <ListKeyboardNavigationProvider pathname={location.pathname}>
      <DesktopOverlayMainNavigationListener />
      <RegisterPageTitleProvider
        pathname={location.pathname}
        registerPageIcon={history.registerPageIcon}
        registerPageTitle={history.registerPageTitle}
        updateActiveTabIcon={updateActiveTabIcon}
        updateActiveTabTitle={updateActiveTabTitle}
      >
      <ProductAppShell
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        onActivateTab={activateTab}
        onCloseTab={closeTab}
        onOpenNewTab={openNewTab}
        renderTabIcon={(tab) =>
          createElement(HistoryEntryIcon, {
            display: resolveHistoryEntryDisplay(tab.href, tab.title),
            icon: tab.icon,
          })
        }
        showSidePanel={Boolean(sidePanel) && !sidePanelCollapsed}
        sidePanel={sidePanel}
        chromeHeader={
          chromeHeader ??
          (sidePanel ? <BreadcrumbChromeSkeleton /> : null)
        }
      >
        {children}
      </ProductAppShell>
      </RegisterPageTitleProvider>
      <CommandPaletteView
        navigate={(href) => navigate(href)}
        pathname={location.pathname}
        entityNames={paletteEntityNames}
        resolveContextIds={resolvePaletteContextIds}
        search={searchFn}
      />
      <ComposeModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        pathname={`${location.pathname}${location.search}`}
        projects={composeProjects}
        contacts={composeContacts}
        defaultAssigneeId={getDefaultAssigneeId()}
        documentFoldersByTarget={documentFoldersByTarget}
        projectsHref="/projects"
        onNavigate={(href) => navigate(href)}
        onCreateTask={async (input) => {
          if (input.projectId) {
            const project = workspace.projects.find(
              (entry) => entry.id === input.projectId,
            );
            const created = await workspace.createProjectTask({
              projectId: input.projectId,
              title: input.title,
              description: input.description,
              status: input.status,
              assigneeId: input.assigneeId,
              dueDate: input.dueDate,
            });
            if (project && created.number != null) {
              return {
                href: getScopedProjectTaskHref(project.key, created.number),
              };
            }
            return { href: `/tasks/${created.id}` };
          }
          const created = await workspace.createInboxTask({
            title: input.title,
            description: input.description,
            status: input.status,
            assigneeId: input.assigneeId,
            dueDate: input.dueDate,
          });
          if (created.number != null) {
            return {
              href: getInboxTaskRouteHref({ number: created.number }),
            };
          }
          return { href: `/inbox/${created.id}` };
        }}
        onCreateDocument={async (input) => {
          if (input.target === "knowledge") {
            const created = await workspace.createKnowledgeDocument({
              title: input.title,
              folderPath: input.folderPath,
            });
            return {
              href: getKnowledgeHref(created.path || created.id),
            };
          }
          if (!input.projectId) {
            throw new Error("Select a project for this document.");
          }
          const project = workspace.projects.find(
            (entry) => entry.id === input.projectId,
          );
          if (!project) {
            throw new Error("Project not found.");
          }
          const created = await workspace.createProjectDocument({
            projectId: input.projectId,
            title: input.title,
            folderPath: input.folderPath,
          });
          return {
            href: getProjectDocumentHref(project.key, created.path || created.id),
          };
        }}
      />
    </ListKeyboardNavigationProvider>
    </MentionCatalogProvider>
    </MentionNavigationProvider>
    </ClientLinkProvider>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <CommandPaletteProvider>
      <EntityHeaderActionsShell>
        <ChromeHeaderProvider>
          <JournalSelectionProvider>
            <AppShellInner>{children}</AppShellInner>
          </JournalSelectionProvider>
        </ChromeHeaderProvider>
      </EntityHeaderActionsShell>
    </CommandPaletteProvider>
  );
}
