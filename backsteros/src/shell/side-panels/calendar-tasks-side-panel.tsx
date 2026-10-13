import { useEffect, useMemo, useRef, useState } from "react";

import {
  CalendarTasksSidePanelView,
  type CalendarPageMode,
  type CalendarSidePanelHabitItem,
  type MeetingListItem,
  unscheduledCalendarTasks,
  buildCalendarSidePanelKeyboardItemIds,
  getSelectedCalendarSidePanelItemId,
  parseCalendarSidePanelKeyboardItemId,
  setCalendarSidePanelKeyboardHighlightId,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
} from "@backsteros/ui";

import { useKeepAliveActive } from "../../lib/shell-route-keep-alive";

/** Tasks/habits body — chrome owned by DesktopCalendarSidePanel when embedded. */
export function DesktopCalendarTasksSidePanel({
  pathname,
  search,
  tasks,
  meetings = [],
  habits = [],
  loading,
  onCreateMeeting,
  onMeetingOpen,
  onTaskOpen,
  onToggleHabit,
  embedded = false,
  pageMode,
  onPageModeChange,
}: {
  pathname: string;
  search: string;
  tasks: ReturnType<typeof unscheduledCalendarTasks>;
  meetings?: MeetingListItem[];
  habits?: CalendarSidePanelHabitItem[];
  loading?: boolean;
  onCreateMeeting: () => void;
  onMeetingOpen?: (meetingId: string) => void;
  onTaskOpen: (taskId: string) => void;
  onToggleHabit?: (
    habit: CalendarSidePanelHabitItem,
    checked: boolean,
  ) => void;
  embedded?: boolean;
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
}) {
  const keepAliveActive = useKeepAliveActive();
  const listRef = useRef<HTMLElement>(null);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [habitsCollapsed, setHabitsCollapsed] = useState(false);
  const [inboxMeetingsCollapsed, setInboxMeetingsCollapsed] = useState(false);
  const selectedItemId = getSelectedCalendarSidePanelItemId(pathname, search);
  const itemIds = useMemo(
    () =>
      buildCalendarSidePanelKeyboardItemIds({
        // Left panel owns triage/inbox meetings; scheduled stay on the right rail.
        meetings,
        tasks,
        habits,
        inboxCollapsed: inboxMeetingsCollapsed,
        habitsCollapsed,
        tasksCollapsed,
        meetingsCollapsed: true,
      }),
    [
      habits,
      habitsCollapsed,
      inboxMeetingsCollapsed,
      meetings,
      tasks,
      tasksCollapsed,
    ],
  );
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedItemId,
    onNavigate: (itemId) => {
      setCalendarSidePanelKeyboardHighlightId(itemId);
      const parsed = parseCalendarSidePanelKeyboardItemId(itemId);
      if (!parsed) return;
      if (parsed.kind === "habit") {
        // Habits stay in-panel (checkbox / drag) — no overlay.
        return;
      }
      if (parsed.kind === "meeting") {
        onMeetingOpen?.(parsed.entityId);
        return;
      }
      if (parsed.kind === "task") {
        onTaskOpen(parsed.entityId);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: keepAliveActive && itemIds.length > 0,
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
      tasks={tasks}
      meetings={meetings}
      habits={habits}
      loading={loading}
      pageMode={pageMode}
      onPageModeChange={onPageModeChange}
      onCreateMeeting={onCreateMeeting}
      onMeetingOpen={onMeetingOpen}
      onTaskOpen={onTaskOpen}
      onToggleHabit={onToggleHabit}
      selectedItemId={selectedItemId}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      embedded={embedded}
      inboxMeetingsCollapsed={inboxMeetingsCollapsed}
      onToggleInboxMeetingsGroup={() => {
        setInboxMeetingsCollapsed((value) => !value);
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
