import { useEffect, useMemo, useRef, useState } from "react";

import {
  CalendarTasksSidePanelView,
  type CalendarSidePanelHabitItem,
  unscheduledCalendarTasks,
  buildCalendarSidePanelKeyboardItemIds,
  getSelectedCalendarSidePanelItemId,
  parseCalendarSidePanelKeyboardItemId,
  setCalendarSidePanelKeyboardHighlightId,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
} from "@backsteros/ui";

import { useCalendarPageModeControls } from "../../lib/use-calendar-page-mode";
import type { useDesktopWorkspaceMeta } from "../../lib/workspace-data";

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
  meetings: ReturnType<typeof useDesktopWorkspaceMeta>["meetings"];
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
