import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  ContactsSidePanelView,
  CalendarTasksSidePanelView,
  CalendarAvailabilitySidePanelView,
  CalendarTimetrackingSidePanelView,
  CALENDAR_PAGE_MODE_OPTIONS,
  CALENDAR_PAGE_MODE_PARAM,
  CALENDAR_TIMETRACKING_DATE_PARAM,
  CALENDAR_TIMETRACKING_WEEK_PARAM,
  CALENDAR_TIMETRACKING_MONTH_PARAM,
  ContentSidePanelEmpty,
  ContentSidePanelHeader,
  FinanceSidePanelNavView,
  HabitSidePanelView,
  JournalSidePanelView,
  KnowledgeSidePanelView,
  LettersSidePanelView,
  OrganizationsSidePanelView,
  ProjectDocumentsSidePanelView,
  type CalendarSidePanelHabitItem,
  contactMatchesSlug,
  getContactSidePanelHref,
  getHabitTrackerHref,
  HABIT_TRACKER_ALL_ID,
  getJournalHref,
  getKnowledgeHref,
  getLettersHref,
  getOrganizationSidePanelHref,
  getSelectedContactSlugFromPathname,
  getSelectedHabitIdFromPathname,
  getSelectedJournalDateFromPathname,
  getSelectedKnowledgeSlugFromPathname,
  getSelectedLetterSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
  getSelectedFinanceNavIdFromPathname,
  getSelectedProjectDocumentPathFromPathname,
  getUniqueListItemRouteParam,
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  groupItemsByAlphaLetter,
  groupBankAccountsForFinanceNav,
  FINANCE_NAV_ITEMS,
  financeSidePanelAccountKeyboardId,
  resolveFinanceSidePanelHref,
  isFinanceAccountPath,
  unscheduledCalendarTasks,
  isValidJournalDateSlug,
  letterMatchesSlug,
  organizationMatchesSlug,
  parseFolderNavId,
  buildCalendarSidePanelKeyboardItemIds,
  getSelectedCalendarSidePanelItemId,
  getCalendarSidePanelKeyboardHighlightId,
  parseCalendarSidePanelKeyboardItemId,
  readTimetrackingPeriodFromSearch,
  buildTimetrackingDayGroups,
  buildTimetrackingSidePanelKeyboardItemIds,
  getSelectedTimetrackingSidePanelItemId,
  parseTimetrackingSidePanelItemId,
  setCalendarSidePanelKeyboardHighlightId,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type ContactsSidePanelViewProps,
  type FinanceAccountGroupId,
  type FinanceSidePanelNavViewProps,
  type HabitSidePanelViewProps,
  type JournalSidePanelViewProps,
  type KnowledgeSidePanelViewProps,
  type LettersSidePanelViewProps,
  type OrganizationsSidePanelViewProps,
  type ProjectDocumentsSidePanelViewProps,
  SegmentedPillToggle,
} from "@backsteros/ui";
import type { BankAccount } from "@backsteros/contracts";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  prefetchJournalEntryContent,
  prefetchKnowledgeDocumentContent,
  prefetchLetterAttachments,
} from "../lib/prefetch-workspace-content";
import { useJournalSelection } from "../lib/journal-selection-context";
import { useMeetingSchedulingSettings } from "../lib/use-meeting-scheduling-settings";
import { useCalendarPageModeControls } from "../lib/use-calendar-page-mode";
import { useDesktopSidePanelListNav } from "../lib/use-desktop-side-panel-list-nav";
import { useDesktopResource } from "../lib/use-desktop-resource";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { RouterLink } from "./app-shell-links";

type SidePanelNavProps = { onNavigate: (href: string) => void };

export { DesktopInboxSidePanel } from "./app-shell-inbox-side-panel";

export function DesktopCalendarTasksSidePanel({
  pathname,
  search,
  meetings,
  tasks,
  habits = [],
  loading,
  onCreateMeeting,
  onMeetingOpen,
  onTaskOpen,
  onToggleHabit,
  panelVariant = "calendar",
}: {
  pathname: string;
  search: string;
  meetings: ReturnType<typeof useDesktopWorkspaceData>["meetings"];
  tasks: ReturnType<typeof unscheduledCalendarTasks>;
  habits?: CalendarSidePanelHabitItem[];
  loading?: boolean;
  panelVariant?: "calendar" | "meetings";
  onCreateMeeting: () => void;
  onMeetingOpen: (meetingId: string) => void;
  onTaskOpen: (taskId: string) => void;
  onToggleHabit?: (
    habit: CalendarSidePanelHabitItem,
    checked: boolean,
  ) => void;
}) {
  const { pageMode, handlePageModeChange } = useCalendarPageModeControls();
  const listRef = useRef<HTMLElement>(null);
  const [inboxCollapsed, setInboxCollapsed] = useState(false);
  const [meetingsCollapsed, setMeetingsCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [habitsCollapsed, setHabitsCollapsed] = useState(false);
  const selectedItemId = getSelectedCalendarSidePanelItemId(pathname, search);
  const itemIds = useMemo(
    () =>
      buildCalendarSidePanelKeyboardItemIds({
        meetings,
        tasks,
        habits,
        inboxCollapsed,
        meetingsCollapsed,
        habitsCollapsed,
        tasksCollapsed,
      }),
    [
      meetings,
      habits,
      inboxCollapsed,
      meetingsCollapsed,
      habitsCollapsed,
      tasks,
      tasksCollapsed,
    ],
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedItemId,
    defaultHighlightedId:
      selectedItemId == null
        ? getCalendarSidePanelKeyboardHighlightId()
        : null,
    onNavigate: (itemId) => {
      setCalendarSidePanelKeyboardHighlightId(itemId);
      const parsed = parseCalendarSidePanelKeyboardItemId(itemId);
      if (!parsed) return;
      if (parsed.kind === "meeting") {
        onMeetingOpen(parsed.entityId);
        return;
      }
      if (parsed.kind === "habit") {
        // Habits stay in-panel (checkbox / drag) — no overlay.
        return;
      }
      onTaskOpen(parsed.entityId);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  useEffect(() => {
    if (highlightedId) {
      setCalendarSidePanelKeyboardHighlightId(highlightedId);
    }
  }, [highlightedId]);

  return (
    <CalendarTasksSidePanelView
      meetings={meetings}
      tasks={tasks}
      habits={habits}
      loading={loading}
      panelVariant={panelVariant}
      pageMode={pageMode}
      onPageModeChange={handlePageModeChange}
      onCreateMeeting={onCreateMeeting}
      onMeetingOpen={onMeetingOpen}
      onTaskOpen={onTaskOpen}
      onToggleHabit={onToggleHabit}
      selectedItemId={selectedItemId}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      inboxCollapsed={inboxCollapsed}
      onToggleInboxGroup={() => {
        setInboxCollapsed((value) => !value);
      }}
      meetingsCollapsed={meetingsCollapsed}
      onToggleMeetingsGroup={() => {
        setMeetingsCollapsed((value) => !value);
      }}
      habitsCollapsed={habitsCollapsed}
      onToggleHabitsGroup={() => {
        setHabitsCollapsed((value) => !value);
      }}
      tasksCollapsed={tasksCollapsed}
      onToggleTasksGroup={() => {
        setTasksCollapsed((value) => !value);
      }}
    />
  );
}

export function DesktopCalendarAvailabilitySidePanel() {
  const { settings, loading, setWeekdayHours } = useMeetingSchedulingSettings();
  const { pageMode, handlePageModeChange } = useCalendarPageModeControls();

  if (!settings) {
    return (
      <div className="app-content-side-panel calendar-side-panel calendar-availability-side-panel">
        <ContentSidePanelHeader title="Availability" />
        <div className="app-content-side-panel-main">
          <ContentSidePanelEmpty>
            {loading ? "Loading availability…" : "Unable to load availability settings."}
          </ContentSidePanelEmpty>
        </div>
        <div className="calendar-side-panel__footer">
          <SegmentedPillToggle
            value={pageMode}
            options={CALENDAR_PAGE_MODE_OPTIONS}
            onChange={handlePageModeChange}
            ariaLabel="Calendar page mode"
          />
        </div>
      </div>
    );
  }
  return (
    <CalendarAvailabilitySidePanelView
      weekdayHours={settings.weekdayHours}
      loading={loading}
      pageMode={pageMode}
      onPageModeChange={handlePageModeChange}
      onWeekdayHoursChange={setWeekdayHours}
    />
  );
}

export function DesktopCalendarTimetrackingSidePanel() {
  const { pageMode, handlePageModeChange } = useCalendarPageModeControls();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = readTimetrackingPeriodFromSearch(
    `?${searchParams.toString()}`,
    { fallbackToday: true },
  );
  const monthGroups = useMemo(
    () => buildTimetrackingDayGroups({ monthsBack: 3 }),
    [],
  );
  const [collapsedWeeks, setCollapsedWeeks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const itemIds = useMemo(
    () => buildTimetrackingSidePanelKeyboardItemIds(monthGroups, collapsedWeeks),
    [collapsedWeeks, monthGroups],
  );
  const selectedId = getSelectedTimetrackingSidePanelItemId(period);

  const setTimetrackingParams = (
    updater: (next: URLSearchParams) => void,
  ) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(CALENDAR_PAGE_MODE_PARAM, "timetracking");
        next.delete(CALENDAR_TIMETRACKING_DATE_PARAM);
        next.delete(CALENDAR_TIMETRACKING_WEEK_PARAM);
        next.delete(CALENDAR_TIMETRACKING_MONTH_PARAM);
        updater(next);
        return next;
      },
      { replace: true },
    );
  };

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      onNavigate: (itemId) => {
        const parsed = parseTimetrackingSidePanelItemId(itemId);
        if (!parsed) return;
        if (parsed.kind === "day") {
          setTimetrackingParams((next) => {
            next.set(CALENDAR_TIMETRACKING_DATE_PARAM, parsed.ymd);
          });
          return;
        }
        if (parsed.kind === "week") {
          for (const month of monthGroups) {
            const week = month.weeks.find(
              (entry) => entry.weekKey === parsed.weekKey,
            );
            if (!week) continue;
            setTimetrackingParams((next) => {
              next.set(CALENDAR_TIMETRACKING_WEEK_PARAM, week.weekKey);
            });
            return;
          }
          return;
        }
        for (const month of monthGroups) {
          if (month.monthKey !== parsed.monthKey) continue;
          setTimetrackingParams((next) => {
            next.set(CALENDAR_TIMETRACKING_MONTH_PARAM, month.monthKey);
          });
          return;
        }
      },
      enabled: itemIds.length > 0,
    });

  return (
    <CalendarTimetrackingSidePanelView
      pageMode={pageMode}
      onPageModeChange={handlePageModeChange}
      period={period}
      monthGroups={monthGroups}
      collapsedWeeks={collapsedWeeks}
      onCollapsedWeeksChange={setCollapsedWeeks}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      onSelectDay={(ymd) => {
        setTimetrackingParams((next) => {
          next.set(CALENDAR_TIMETRACKING_DATE_PARAM, ymd);
        });
      }}
      onSelectWeek={(weekKey) => {
        setTimetrackingParams((next) => {
          next.set(CALENDAR_TIMETRACKING_WEEK_PARAM, weekKey);
        });
      }}
      onSelectMonth={(monthKey) => {
        setTimetrackingParams((next) => {
          next.set(CALENDAR_TIMETRACKING_MONTH_PARAM, monthKey);
        });
      }}
    />
  );
}

export function DesktopJournalSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  JournalSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps" | "Link"
> &
  SidePanelNavProps) {
  const { client } = useDesktopApi();
  const { selectDate } = useJournalSelection();
  const workspace = useDesktopWorkspaceData();
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

  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      onNavigate: (dateSlug) => {
        selectDate(dateSlug);
        onNavigate(getJournalHref(dateSlug));
      },
      enabled: items.length > 0,
      prefetchItemId,
    });

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

  return (
    <JournalSidePanelView
      {...viewProps}
      items={items}
      Link={PrefetchLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

export function DesktopHabitSidePanel({
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
      Link={PrefetchLink}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
      onVisibleNavItemIdsChange={setNavItemIds}
      onFolderActivateRef={folderActivateRef}
    />
  );
}

export function DesktopLettersSidePanel({
  onNavigate,
  getLetterHref,
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
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

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

export function DesktopContactsSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  ContactsSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedContactSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => contactMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;
  // Match DOM order from alpha-grouped rendering so j/k follows the visible list.
  const itemIds = groupItemsByAlphaLetter(items).flatMap(([, entries]) =>
    entries.map((item) => item.id),
  );
  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
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
      enabled: items.length > 0,
    });
  return (
    <ContactsSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}

export function DesktopOrganizationsSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  OrganizationsSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
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
  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
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
      enabled: items.length > 0,
    });
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

export function DesktopFinanceSidePanel({
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
