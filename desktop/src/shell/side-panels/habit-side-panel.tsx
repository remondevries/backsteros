import { useMemo, useRef, useState } from "react";

import {
  HabitSidePanelView,
  getHabitTrackerHref,
  getHabitTrackerV2Href,
  HABIT_TRACKER_ALL_ID,
  getSelectedHabitIdFromPathname,
  getSelectedHabitIdFromHabitsV2Pathname,
  getTaskDueDateYmd,
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
import { useKeepAliveAfterPaint } from "../../lib/shell-route-keep-alive";
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
  /** `habits-v2` keeps navigation inside `/habits-v2/...`. */
  variant?: "habits" | "habits-v2";
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
  variant = "habits",
}: HabitPanelProps) {
  const { habits } = useDesktopWorkspaceMeta();
  return (
    <HabitSidePanelChrome
      onNavigate={onNavigate}
      pathname={pathname}
      variant={variant}
      items={habitPanelItemsFromHabits(habits)}
    />
  );
}

function HabitSidePanelLive({
  onNavigate,
  pathname,
  variant = "habits",
}: HabitPanelProps) {
  const { habits } = useDesktopWorkspaceMeta();
  const { allTasks } = useDesktopWorkspaceTasks();
  const todayYmd = getTodayJournalDateSlug();
  const items = useMemo(() => {
    const next = habits.map((habit) => {
      const todayTask = allTasks.find((task) => {
        if (task.habitId !== habit.id) return false;
        return getTaskDueDateYmd(task.dueDate) === todayYmd;
      });
      return {
        ...habit,
        todayTaskId: todayTask?.id ?? null,
        todayTaskStatus: (todayTask?.status ??
          null) as (typeof habit)["todayTaskStatus"],
        checked: todayTask?.status === "completed",
      };
    });
    writeHabitPanelItems(next);
    return next;
  }, [allTasks, habits, todayYmd]);

  return (
    <HabitSidePanelChrome
      onNavigate={onNavigate}
      pathname={pathname}
      variant={variant}
      items={items}
    />
  );
}

function HabitSidePanelChrome({
  onNavigate,
  pathname,
  items,
  variant = "habits",
}: HabitPanelProps & { items: HabitListItem[] }) {
  const listRef = useRef<HTMLElement>(null);
  const { patchTask, createHabit } = useDesktopWorkspaceActions();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [inactiveCollapsed, setInactiveCollapsed] = useState(false);
  const getHabitHref =
    variant === "habits-v2" ? getHabitTrackerV2Href : getHabitTrackerHref;
  const getSelectedIdFromPathname =
    variant === "habits-v2"
      ? getSelectedHabitIdFromHabitsV2Pathname
      : getSelectedHabitIdFromPathname;
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
    getSelectedIdFromPathname(pathname) ?? HABIT_TRACKER_ALL_ID;
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
      onNavigate(getHabitHref(habitId));
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
      getHabitHref={getHabitHref}
      getSelectedIdFromPathname={getSelectedIdFromPathname}
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
          status: checked ? "completed" : "ready_to_start",
        });
      }}
      onCreateHabit={async ({ title, icon }) => {
        setIsCreating(true);
        setCreateError(null);
        try {
          const habit = await createHabit({ title, icon });
          onNavigate(getHabitHref(habit.id));
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
