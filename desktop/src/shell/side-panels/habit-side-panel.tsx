import { useMemo, useRef, useState } from "react";

import {
  HabitSidePanelView,
  getHabitTrackerHref,
  HABIT_TRACKER_ALL_ID,
  getSelectedHabitIdFromPathname,
  getTodayJournalDateSlug,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type HabitListItem,
  type HabitSidePanelViewProps,
} from "@backsteros/ui";

import {
  habitPanelItemsFromHabits,
  writeHabitPanelItems,
} from "../../lib/habit-instances-cache";
import { habitsWithTodayTasks } from "../../lib/habit-today-tasks";
import {
  useKeepAliveActive,
  useKeepAliveAfterPaint,
} from "../../lib/shell-route-keep-alive";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceMeta,
  useDesktopWorkspaceTasks,
} from "../../lib/workspace-data";
import { RouterLink } from "../app-shell-links";

type HabitPanelProps = Omit<
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
  | "getHabitHref"
  | "getSelectedIdFromPathname"
  | "panelTitle"
> & {
  onNavigate: (href: string) => void;
  pathname: string;
};

export function DesktopHabitSidePanel(props: HabitPanelProps) {
  const painted = useKeepAliveAfterPaint();
  if (!painted) {
    return <HabitSidePanelShell {...props} />;
  }
  return <HabitSidePanelLive {...props} />;
}

function HabitSidePanelShell({
  onNavigate,
  pathname,
}: HabitPanelProps) {
  const { habits } = useDesktopWorkspaceMeta();
  return (
    <HabitSidePanelChrome
      onNavigate={onNavigate}
      pathname={pathname}
      items={habitPanelItemsFromHabits(habits)}
    />
  );
}

function HabitSidePanelLive({
  onNavigate,
  pathname,
}: HabitPanelProps) {
  const keepAliveActive = useKeepAliveActive();
  const { habits } = useDesktopWorkspaceMeta();
  const { allTasks } = useDesktopWorkspaceTasks();
  const todayYmd = getTodayJournalDateSlug();
  const items = useMemo(() => {
    const next = habitsWithTodayTasks(habits, allTasks, {
      enabled: keepAliveActive,
      todayYmd,
    });
    if (keepAliveActive) writeHabitPanelItems(next);
    return next;
  }, [allTasks, habits, keepAliveActive, todayYmd]);

  return (
    <HabitSidePanelChrome
      onNavigate={onNavigate}
      pathname={pathname}
      items={items}
    />
  );
}

function HabitSidePanelChrome({
  onNavigate,
  pathname,
  items,
}: HabitPanelProps & { items: HabitListItem[] }) {
  const listRef = useRef<HTMLElement>(null);
  const keepAliveActive = useKeepAliveActive();
  const { patchTask, createHabit } = useDesktopWorkspaceActions();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [inactiveCollapsed, setInactiveCollapsed] = useState(false);
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
    enabled: keepAliveActive && itemIds.length > 0,
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  return (
    <HabitSidePanelView
      pathname={pathname}
      items={items}
      Link={RouterLink}
      getHabitHref={getHabitTrackerHref}
      getSelectedIdFromPathname={getSelectedHabitIdFromPathname}
      panelTitle="Habit Tracker"
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
        void patchTask(habit.todayTaskId, {
          status: checked ? "completed" : "canceled",
        });
      }}
      onCreateHabit={async ({ title, icon }) => {
        setIsCreating(true);
        setCreateError(null);
        try {
          const habit = await createHabit({ title, icon });
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
