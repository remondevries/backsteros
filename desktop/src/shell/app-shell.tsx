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
  FinanceSidePanelNavView,
  HistoryEntryIcon,
  HabitSidePanelView,
  InboxSidePanelView,
  EmailSidePanelView,
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
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  contactMatchesSlug,
  findDocumentTreeNodeById,
  findInboxItemBySlugOrId,
  getContactsHref,
  getContactSidePanelHref,
  getContentSidePanelWidthKey,
  getInboxAttentionKeyboardItemIds,
  getInboxItemHref,
  getInboxTaskRouteHref,
  getHabitTrackerHref,
  HABIT_TRACKER_ALL_ID,
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
  getSelectedHabitIdFromPathname,
  getSelectedJournalDateFromPathname,
  getSelectedKnowledgeSlugFromPathname,
  getSelectedLetterSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
  getSelectedFinanceNavIdFromPathname,
  getSelectedProjectDocumentPathFromPathname,
  getUniqueListItemRouteParam,
  type ClientLinkProps,
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  groupItemsByAlphaLetter,
  groupBankAccountsForFinanceNav,
  FINANCE_NAV_ITEMS,
  financeSidePanelAccountKeyboardId,
  resolveFinanceSidePanelHref,
  isContactSectionPath,
  isEmailPath,
  getEmailComposeHref,
  isFinanceSectionPath,
  isFinanceAccountPath,
  isInboxPath,
  isJournalHabitsPath,
  isJournalSectionPath,
  isValidJournalDateSlug,
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
  refreshOpenTabTaskStatuses,
  resolveProductTabTaskMeta,
  syncActiveTabTaskMeta,
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
  useListKeyboardNavigationZone,
  installSelectAllShortcutListeners,
  installClearSelectionShortcutListeners,
  useNavigationHistory,
  RegisterPageTitleProvider,
  useNavigationShortcuts,
  useFinanceNavigationShortcuts,
  useSectionTabShortcuts,
  useSettingsShortcut,
  useTabShortcuts,
  useTaskPropertyDropdownShortcuts,
  useContentPreviewScrollShortcuts,
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  createDefaultTabsState,
  createProductTab,
  primeTabTitle,
  type ContactsSidePanelViewProps,
  type FinanceAccountGroupId,
  type FinanceSidePanelNavViewProps,
  type HabitSidePanelViewProps,
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
import type { BankAccount } from "@backsteros/contracts";
import { useClerk } from "@clerk/clerk-react";

import { useDesktopApi } from "../lib/api-context";
import { useAgentMailMailboxes } from "../lib/use-agentmail-mailboxes";
import {
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { useCommandPaletteSearchFn } from "../lib/command-palette-search";
import {
  getDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
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
import { useDesktopResource } from "../lib/use-desktop-resource";
import { buildMentionCatalogFromWorkspace } from "../lib/mention-catalog";
import { CursorCreditsUsageBar } from "../components/cursor-credits-usage-bar";
import { DesktopStatusBar } from "../components/desktop-status-bar";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useAgentAttentionNotifications } from "../lib/agent/use-agent-attention-notifications";
import { useComposeGlobalShortcut } from "../lib/use-compose-global-shortcut";
import { useCommandPaletteGlobalShortcut } from "../lib/use-command-palette-global-shortcut";
import { useTauriWindowFullscreen } from "../lib/use-tauri-window-fullscreen";
import {
  projectNavFromLocationState,
  rememberProjectNavFrom,
  resolveProjectNavFromForPath,
  resolveSidebarActivePathname,
} from "../lib/project-type-cache";
import { DesktopOverlayMainNavigationListener } from "../components/desktop-overlay-main-navigation-listener";
import { ExternalOpenHrefListener } from "../components/external-open-href-listener";

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
  children?: ReactNode;
  onClick?: (event?: MouseEvent<HTMLAnchorElement>) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLAnchorElement>) => void;
  title?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
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
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "collapsedGroups"
  | "onToggleGroup"
> &
  SidePanelNavProps) {
  const listRef = useRef<HTMLElement>(null);
  const { pathname, items, groupByAttentionStatus = false } = viewProps;
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selectedSlug = getSelectedInboxSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (findInboxItemBySlugOrId(items, selectedSlug)?.id ?? null)
    : null;
  const itemIds = useMemo(() => {
    if (groupByAttentionStatus) {
      return getInboxAttentionKeyboardItemIds(items, collapsedGroups);
    }
    return items.map((item) => item.id);
  }, [collapsedGroups, groupByAttentionStatus, items]);
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) onNavigate(getInboxItemHref(item, items));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  return (
    <InboxSidePanelView
      {...viewProps}
      collapsedGroups={collapsedGroups}
      onToggleGroup={(status) => {
        setCollapsedGroups((current) => {
          const next = new Set(current);
          if (next.has(status)) next.delete(status);
          else next.add(status);
          return next;
        });
      }}
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
      const rawSlug = String(to).replace(/^\/journal\/?/, "");
      const dateSlug = isValidJournalDateSlug(rawSlug) ? rawSlug : "";
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

function DesktopHabitSidePanel({
  onNavigate,
  pathname,
}: Omit<
  HabitSidePanelViewProps,
  | "items"
  | "Link"
  | "highlightedId"
  | "listRef"
  | "listContainerProps"
  | "onToggleToday"
  | "onCreateHabit"
  | "createDisabled"
  | "createError"
> & {
  onNavigate: (href: string) => void;
  pathname: string;
}) {
  const listRef = useRef<HTMLElement>(null);
  const workspace = useDesktopWorkspaceData();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [inactiveCollapsed, setInactiveCollapsed] = useState(false);
  const todayYmd = getTodayJournalDateSlug();
  const items = useMemo(() => {
    return workspace.habits.map((habit) => {
      const todayTask = workspace.allTasks.find((task) => {
        if (task.habitId !== habit.id) return false;
        return getTaskDueDateYmd(task.dueDate) === todayYmd;
      });
      return {
        ...habit,
        todayTaskId: todayTask?.id ?? null,
        todayTaskStatus: (todayTask?.status ?? null) as typeof habit.todayTaskStatus,
        checked: todayTask?.status === "completed",
      };
    });
  }, [todayYmd, workspace.allTasks, workspace.habits]);
  const openItems = useMemo(
    () => items.filter((item) => item.todayTaskId && !item.checked),
    [items],
  );
  const completedItems = useMemo(
    () => items.filter((item) => item.todayTaskId && item.checked),
    [items],
  );
  const inactiveItems = useMemo(
    () => items.filter((item) => !item.todayTaskId),
    [items],
  );
  const selectedId =
    getSelectedHabitIdFromPathname(pathname) ?? HABIT_TRACKER_ALL_ID;
  const itemIds = useMemo(
    () => [
      HABIT_TRACKER_ALL_ID,
      ...openItems.map((item) => item.id),
      ...(completedCollapsed ? [] : completedItems.map((item) => item.id)),
      ...(inactiveCollapsed ? [] : inactiveItems.map((item) => item.id)),
    ],
    [
      completedCollapsed,
      completedItems,
      inactiveCollapsed,
      inactiveItems,
      openItems,
    ],
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (habitId) => {
      onNavigate(getHabitTrackerHref(habitId));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: true,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  return (
    <HabitSidePanelView
      pathname={pathname}
      items={items}
      Link={RouterLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      createDisabled={isCreating}
      createError={createError}
      completedCollapsed={completedCollapsed}
      onToggleCompletedGroup={() => {
        setCompletedCollapsed((current) => !current);
      }}
      inactiveCollapsed={inactiveCollapsed}
      onToggleInactiveGroup={() => {
        setInactiveCollapsed((current) => !current);
      }}
      onToggleToday={(habit, checked) => {
        if (!habit.todayTaskId) return;
        void workspace.patchTask(habit.todayTaskId, {
          status: checked ? "completed" : "ready_to_start",
        });
      }}
      onCreateHabit={async ({ title, icon }) => {
        setIsCreating(true);
        setCreateError(null);
        try {
          const habit = await workspace.createHabit({ title, icon });
          onNavigate(getHabitTrackerHref(habit.id));
        } catch (error) {
          setCreateError(
            error instanceof Error ? error.message : "Could not create habit.",
          );
          throw error;
        } finally {
          setIsCreating(false);
        }
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

const BANK_ACCOUNTS_CHANGED_EVENT = "backsteros:bank-accounts-changed";

function DesktopFinanceSidePanel({
  pathname,
  Link,
  collapsed,
  onToggleCollapse,
  onExpand,
}: Pick<
  FinanceSidePanelNavViewProps,
  "pathname" | "Link" | "collapsed" | "onToggleCollapse"
> & {
  onExpand?: () => void;
}) {
  const navigate = useNavigate();
  const { client } = useDesktopApi();
  const listRef = useRef<HTMLElement>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<
    Record<FinanceAccountGroupId, boolean>
  >({
    credit_cards: true,
    savings: true,
    investments: true,
    bank_accounts: true,
  });
  const pendingKeyboardExpandRef = useRef(false);
  const { activeZone, setActiveZone } = useListKeyboardNavigationZone();

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void client
        .requestJson<{ bankAccounts: BankAccount[] }>("/api/v1/bank-accounts")
        .then((body) => {
          if (!cancelled) setAccounts(body.bankAccounts);
        })
        .catch(() => {
          if (!cancelled) setAccounts([]);
        });
    };

    load();
    window.addEventListener(BANK_ACCOUNTS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(BANK_ACCOUNTS_CHANGED_EVENT, load);
    };
  }, [client, pathname]);

  const accountAvatarSrcById = useDesktopAvatarSrcMap(
    "bank_account",
    accounts,
  );

  const groups = useMemo(
    () => groupBankAccountsForFinanceNav(accounts),
    [accounts],
  );

  const itemIds = useMemo(() => {
    const ids: string[] = FINANCE_NAV_ITEMS.map((item) => item.id);
    for (const group of groups) {
      if (!expandedGroups[group.id]) continue;
      for (const account of group.accounts) {
        ids.push(
          financeSidePanelAccountKeyboardId(account.key ?? account.id),
        );
      }
    }
    return ids;
  }, [expandedGroups, groups]);

  const selectedId = useMemo(() => {
    const navId = getSelectedFinanceNavIdFromPathname(pathname);
    if (navId) return navId;
    if (!isFinanceAccountPath(pathname)) return null;
    const slug = decodeURIComponent(
      pathname.split("/").filter(Boolean)[1] ?? "",
    );
    return slug ? financeSidePanelAccountKeyboardId(slug) : null;
  }, [pathname]);

  useEffect(() => {
    if (activeZone === LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL && collapsed) {
      pendingKeyboardExpandRef.current = true;
      onExpand?.();
    }
  }, [activeZone, collapsed, onExpand]);

  useEffect(() => {
    if (collapsed || !pendingKeyboardExpandRef.current) return;
    pendingKeyboardExpandRef.current = false;
    setActiveZone(LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL, {
      preferSidepanelForJk: true,
      activate: true,
    });
  }, [collapsed, setActiveZone]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const href = resolveFinanceSidePanelHref(itemId);
      if (href) navigate(href);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  return (
    <FinanceSidePanelNavView
      pathname={pathname}
      accounts={accounts}
      accountAvatarSrcById={accountAvatarSrcById}
      Link={Link}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      expandedGroups={expandedGroups}
      onExpandedGroupsChange={setExpandedGroups}
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
  const { open: commandPaletteOpen, openSearch, openGo, openFinanceGo, setOpen, mode } =
    useCommandPalette();
  const searchFn = useCommandPaletteSearchFn();
  const chromeHeader = useChromeHeader();
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  useAgentAttentionNotifications(workspace.allTasks);
  const settingsPage = isSettingsPath(location.pathname);
  const [tabsState, setTabsState] = useState<ProductTabsState>(() =>
    loadTabsState(location.pathname),
  );
  // Sync the active tab href during render (not in an effect) so child
  // RegisterPageTitle effects run afterward and keep the real entity title.
  // Matching the legacy TabsProvider pattern avoids the child→parent effect
  // order that was overwriting project/task names with "Projects"/"Project".
  const [tabsPathname, setTabsPathname] = useState(location.pathname);
  if (location.pathname !== tabsPathname) {
    setTabsPathname(location.pathname);
    setTabsState((current) =>
      syncActiveTabToPath(current, location.pathname),
    );
  }
  const [composeOpen, setComposeOpen] = useState(false);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const windowFullscreen = useTauriWindowFullscreen();
  const [defaultAssigneeId, setDefaultAssigneeIdState] = useState<string | null>(
    () => getDefaultAssigneeId(),
  );
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
    if (!workspace.ready) return;
    void workspace.reloadHabits().catch(() => {
      // Rollover runs again when Habit Tracker is opened.
    });
  }, [todayJournalSlug, workspace.ready, workspace.reloadHabits]);

  useEffect(() => {
    let cancelled = false;
    void client
      .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
      .then((body) => {
        if (cancelled) return;
        setDefaultAssigneeIdState(
          syncDefaultAssigneeIdFromSettings(body.settings),
        );
      })
      .catch(() => {
        // keep local cache
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    const stored = localStorage.getItem("backsteros:sidebar-visible");
    if (stored === null) return;
    const frame = requestAnimationFrame(() =>
      setSidebarCollapsed(stored === "false"),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    installSelectAllShortcutListeners();
    installClearSelectionShortcutListeners();
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

  const activeTab = tabsState.tabs.find(
    (tab) => tab.id === tabsState.activeTabId,
  );
  const tabIds = useMemo(
    () => tabsState.tabs.map((tab) => tab.id),
    [tabsState.tabs],
  );
  const history = useNavigationHistory({
    pathname: location.pathname,
    search: location.search,
    onNavigate: navigateTo,
    activeTabId: tabsState.activeTabId,
    activeTabHref: activeTab?.href ?? location.pathname,
    tabIds,
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

  useEffect(() => {
    function onOpenCompose() {
      if (commandPaletteOpen) return;
      setComposeOpen(true);
    }
    window.addEventListener("backsteros:open-compose", onOpenCompose);
    return () =>
      window.removeEventListener("backsteros:open-compose", onOpenCompose);
  }, [commandPaletteOpen]);

  useCommandPaletteGlobalShortcut({
    enabled: true,
    onOpenPalette: openSearch,
  });

  useNavigationShortcuts({
    enabled: true,
    commandPaletteOpen,
    commandPaletteMode: mode,
    openGo,
    openFinanceGo,
    closePalette,
    onNavigate: navigateTo,
  });

  useFinanceNavigationShortcuts({
    enabled: true,
    pathname: location.pathname,
    commandPaletteOpen,
    commandPaletteMode: mode,
    openFinanceGo,
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
        type: project.type ?? null,
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
      workspace.allTasks,
      workspace.contacts,
      workspace.inboxItems,
      workspace.knowledgeDocuments,
      workspace.letters,
      workspace.organizations,
      workspace.projectDocuments,
      workspace.projectSummaries,
      workspace.projects,
    ],
  );

  // Keep the active tab's task id/status so product tabs show status icons
  // (and working pulse) instead of the generic tasks glyph. Inbox stays on
  // the section glyph, so clear any leftover task meta there.
  useEffect(() => {
    if (isInboxPath(location.pathname)) {
      setTabsState((current) =>
        syncActiveTabTaskMeta(current, {
          taskId: null,
          taskStatus: null,
        }),
      );
      return;
    }
    const meta = resolveProductTabTaskMeta(
      { id: "active", href: location.pathname, title: "" },
      workspace.allTasks,
    );
    setTabsState((current) =>
      syncActiveTabTaskMeta(current, {
        taskId: meta.taskId,
        taskStatus: meta.taskStatus,
      }),
    );
  }, [location.pathname, workspace.allTasks]);

  // Background tabs: refresh stored status from live workspace data.
  useEffect(() => {
    const statusByTaskId = new Map(
      workspace.allTasks.map((task) => [task.id, task.status] as const),
    );
    setTabsState((current) =>
      refreshOpenTabTaskStatuses(current, statusByTaskId),
    );
  }, [workspace.allTasks]);

  useEffect(() => {
    const payload = JSON.stringify(tabsState);
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, payload);
      return;
    } catch (error) {
      const isQuota =
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED");
      if (!isQuota) return;

      // Agent chat transcripts are the usual quota fillers; drop them so
      // chrome prefs (tabs) can still persist and the shell stays mounted.
      try {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (
            key &&
            (key.startsWith("backsteros-desktop.agent-chat-transcript.") ||
              key.startsWith("backsteros-development.agent-chat-transcript."))
          ) {
            keys.push(key);
          }
        }
        for (const key of keys) {
          window.localStorage.removeItem(key);
        }
        window.localStorage.setItem(TABS_STORAGE_KEY, payload);
      } catch {
        /* ignore — prefer a live shell over persisted tabs */
      }
    }
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
  const agentMail = useAgentMailMailboxes(isEmailPath(panelPathname));

  const projectRouteParam = getProjectRouteParamFromPathname(panelPathname);
  const projectRouteScope = getProjectRouteScopeFromPathname(panelPathname);
  const activeProject = projectRouteParam
    ? workspace.projects.find(
        (project) =>
          project.id === projectRouteParam ||
          project.key.toLowerCase() === projectRouteParam.toLowerCase(),
      ) ?? null
    : null;

  // Codebase Docs live in the workbench list pane — hide the chrome documents
  // side panel so we don't stack two document trees.
  const showSidePanel =
    !settingsPage &&
    shouldShowContentSidePanel(panelPathname) &&
    !(
      activeProject?.type === "codebase" &&
      isProjectDocumentsSectionPath(panelPathname)
    );

  useContentSidePanelToggleShortcut({
    enabled: showSidePanel,
    onToggle: () => setSidePanelCollapsed((current) => !current),
  });

  useDocumentTreeCreateFolderShortcut({
    pathname: panelPathname,
    enabled: true,
  });

  const projectNavFrom = resolveProjectNavFromForPath({
    locationState: location.state,
    projectId: activeProject?.id,
    projectKey: activeProject?.key,
    routeParam: projectRouteParam,
  });

  useEffect(() => {
    if (!activeProject) return;
    const from = projectNavFromLocationState(location.state);
    if (from) {
      rememberProjectNavFrom(activeProject.id, activeProject.key, from);
    }
  }, [activeProject, location.state]);

  const sidebarActivePathname = resolveSidebarActivePathname(
    pathname,
    projectNavFrom,
  );

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
            const taskTitle =
              item && item.kind === "task" ? item.title : null;
            if (item && item.kind === "task" && item.number != null) {
              const href = getInboxTaskRouteHref({ number: item.number });
              if (taskTitle) primeTabTitle(href, taskTitle);
              navigate(href);
              return;
            }
            const href = `/inbox/${taskId}`;
            if (taskTitle) primeTabTitle(href, taskTitle);
            navigate(href);
          }}
          projectOptions={buildProjectDropdownOptions(
            workspace.projects.map((project) => ({
              key: project.key,
              name: project.name,
              icon: project.icon,
              type: project.type,
            })),
            {
              includeNone: true,
            },
          )}
          assigneeOptions={buildAssigneeDropdownOptions(composeContacts)}
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
              inbox: !project,
              ...(project ? {} : { status: "triage" }),
            });
          }}
          onAssigneeChange={(taskId, assigneeId) => {
            void workspace.patchTask(taskId, { assigneeId });
          }}
          groupByAttentionStatus
          renderTitleTrailing={(item) => {
            if (item.kind !== "task") return null;
            return renderTaskAgentTitleTrailing({
              taskId: item.id,
              agentChatId: workspace.allTasks.find((task) => task.id === item.id)
                ?.agentChatId,
              taskStatus: workspace.allTasks.find((task) => task.id === item.id)
                ?.status,
              agentStatus,
            });
          }}
        />
      );
    } else if (isEmailPath(panelPathname)) {
      const emailItems = agentMail.messages.map((item) => ({
        ...item,
        contactAvatarSrc: item.contactId
          ? (contactAvatarSrc[item.contactId] ?? null)
          : null,
      }));
      sidePanelBody = (
        <EmailSidePanelView
          pathname={panelPathname}
          mailboxes={agentMail.mailboxes}
          items={emailItems}
          loading={agentMail.loading}
          messagesLoading={agentMail.messagesLoading}
          apiKeyConfigured={agentMail.apiKeyConfigured}
          Link={RouterLink}
          onCompose={() => navigateTo(getEmailComposeHref())}
        />
      );
    } else if (isJournalHabitsPath(panelPathname)) {
      sidePanelBody = (
        <DesktopHabitSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
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
          getLetterHref={(letter) =>
            getScopedProjectLetterHref(projectKey, letter.number, projectRouteScope)
          }
          onAdd={() => {
            void workspace
              .createLetter({
                title: "New letter",
                projectId: activeProject.id,
              })
              .then((created) => {
                if (created.number == null) return;
                const href = getScopedProjectLetterHref(
                  projectKey,
                  created.number,
                  projectRouteScope,
                );
                primeTabTitle(href, "New letter");
                navigate(href);
              });
          }}
        />
      );
    } else if (isLettersSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopLettersSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.letters}
          loading={!workspace.ready}
          onAdd={() => {
            void workspace
              .createLetter({ title: "New letter" })
              .then((created) => {
                if (created.number == null) return;
                const href = getLettersHref(created.number);
                primeTabTitle(href, "New letter");
                navigate(href);
              });
          }}
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
    } else if (isFinanceSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopFinanceSidePanel
          pathname={panelPathname}
          Link={RouterLink}
          collapsed={sidePanelCollapsed}
          onToggleCollapse={() =>
            setSidePanelCollapsed((current) => !current)
          }
          onExpand={() => setSidePanelCollapsed(false)}
        />
      );
    }
  }

  // Finance keeps a slim expand rail when collapsed (so it can be reopened
  // from the same spot); other sections hide the panel entirely.
  const financeSection = isFinanceSectionPath(panelPathname);
  const financeRail = financeSection && sidePanelCollapsed;

  const sidePanel =
    showSidePanel && sidePanelBody ? (
      financeRail ? (
        <aside className="context-panel context-panel--rail">
          {sidePanelBody}
        </aside>
      ) : (
        <ResizableContextPanel
          storageKey={getContentSidePanelWidthKey(panelPathname)}
        >
          {sidePanelBody}
        </ResizableContextPanel>
      )
    ) : undefined;

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
          activePathname={sidebarActivePathname}
          Link={RouterLink}
          onBack={history.goBack}
          onForward={history.goForward}
          canGoBack={history.canGoBack}
          canGoForward={history.canGoForward}
          footer={<CursorCreditsUsageBar />}
          inboxHasItems={workspace.inboxItems.length > 0}
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
      <ExternalOpenHrefListener />
      <RegisterPageTitleProvider
        pathname={location.pathname}
        registerPageIcon={history.registerPageIcon}
        registerPageTitle={history.registerPageTitle}
        updateActiveTabIcon={updateActiveTabIcon}
        updateActiveTabTitle={updateActiveTabTitle}
      >
      <ProductAppShell
        className={windowFullscreen ? "is-window-fullscreen" : undefined}
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        onActivateTab={activateTab}
        onCloseTab={closeTab}
        onOpenNewTab={openNewTab}
        renderTabIcon={(tab) => {
          // Inbox tabs always keep the inbox glyph — status/working icons
          // are for task detail tabs elsewhere (projects, tasks, etc.).
          // Email tabs stay on the envelope until message entities exist.
          if (isInboxPath(tab.href)) {
            return createElement(HistoryEntryIcon, {
              display: {
                kind: "navigate",
                navId: "inbox",
                badgeLabel: "Inbox",
                title: tab.title,
              },
            });
          }
          if (isEmailPath(tab.href)) {
            return createElement(HistoryEntryIcon, {
              display: {
                kind: "navigate",
                navId: "email",
                badgeLabel: "Email",
                title: tab.title,
              },
            });
          }
          const meta = resolveProductTabTaskMeta(tab, workspace.allTasks);
          const working = Boolean(
            meta.taskId &&
              isTaskAgentWorkingForUi(
                { id: meta.taskId, status: meta.taskStatus },
                agentStatus,
              ),
          );
          return createElement(HistoryEntryIcon, {
            display: resolveHistoryEntryDisplay(tab.href, tab.title),
            icon: tab.icon,
            taskStatus: meta.taskStatus,
            working,
          });
        }}
        showSidePanel={
          Boolean(sidePanel) && (!sidePanelCollapsed || financeRail)
        }
        sidePanel={sidePanel}
        chromeHeader={
          chromeHeader ??
          (sidePanel ? <BreadcrumbChromeSkeleton /> : null)
        }
        statusBar={sidebarCollapsed ? null : <DesktopStatusBar />}
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
        defaultAssigneeId={defaultAssigneeId}
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
              priority: input.priority,
              assigneeId: input.assigneeId,
              dueDate: input.dueDate,
              links: input.links,
            });
            if (project && created.number != null) {
              const href = getScopedProjectTaskHref(
                project.key,
                created.number,
              );
              primeTabTitle(href, input.title);
              return { href };
            }
            const href = `/tasks/${created.id}`;
            primeTabTitle(href, input.title);
            return { href };
          }
          const created = await workspace.createInboxTask({
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            assigneeId: input.assigneeId,
            dueDate: input.dueDate,
            links: input.links,
          });
          if (created.number != null) {
            const href = getInboxTaskRouteHref({ number: created.number });
            primeTabTitle(href, input.title);
            return { href };
          }
          const href = `/inbox/${created.id}`;
          primeTabTitle(href, input.title);
          return { href };
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
