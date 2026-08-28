import {
  CalendarSidePanelModeFooter,
  ContentSidePanelShell,
  SidePanelPlusIcon,
  isCalendarListPath,
  type CalendarPageMode,
  type CalendarSidePanelHabitItem,
  unscheduledCalendarTasks,
} from "@backsteros/ui";

import { useCalendarPageModeControls } from "../../lib/use-calendar-page-mode";
import type { useDesktopWorkspaceMeta } from "../../lib/workspace-data";
import { DesktopCalendarAvailabilitySidePanel } from "./calendar-availability-side-panel";
import { DesktopCalendarTasksSidePanel } from "./calendar-tasks-side-panel";
import { DesktopCalendarTimetrackingSidePanel } from "./calendar-timetracking-side-panel";

export type DesktopCalendarSidePanelProps = {
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
};

function resolveCalendarBodyMode(
  pathname: string,
  pageMode: CalendarPageMode,
): "availability" | "timetracking" | "calendar" {
  if (!isCalendarListPath(pathname)) return "calendar";
  if (pageMode === "availability") return "availability";
  if (pageMode === "timetracking") return "timetracking";
  return "calendar";
}

/**
 * Stable calendar left-list root. Mode changes swap the embedded body only —
 * header, main scroll chrome, and mode footer stay mounted.
 */
export function DesktopCalendarSidePanel({
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
}: DesktopCalendarSidePanelProps) {
  const { pageMode, handlePageModeChange } = useCalendarPageModeControls();
  const bodyMode = resolveCalendarBodyMode(pathname, pageMode);

  const title =
    bodyMode === "availability"
      ? "Availability"
      : bodyMode === "timetracking"
        ? "Timetracking"
        : panelVariant === "meetings"
          ? "Meetings"
          : "Calendar";

  const className = [
    "calendar-side-panel",
    bodyMode === "availability" ? "calendar-availability-side-panel" : null,
    bodyMode === "timetracking" ? "calendar-timetracking-side-panel" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const headerActions =
    bodyMode === "calendar" && onCreateMeeting ? (
      <button
        type="button"
        className="app-side-panel-section-action"
        aria-label="Create meeting"
        onClick={onCreateMeeting}
      >
        <SidePanelPlusIcon />
      </button>
    ) : null;

  return (
    <ContentSidePanelShell
      title={title}
      className={className}
      headerActions={headerActions}
      wrapList={false}
      afterMain={
        <CalendarSidePanelModeFooter
          pageMode={pageMode}
          onPageModeChange={handlePageModeChange}
        />
      }
    >
      {bodyMode === "availability" ? (
        <DesktopCalendarAvailabilitySidePanel
          embedded
          pageMode={pageMode}
          onPageModeChange={handlePageModeChange}
        />
      ) : bodyMode === "timetracking" ? (
        <DesktopCalendarTimetrackingSidePanel
          embedded
          pageMode={pageMode}
          onPageModeChange={handlePageModeChange}
        />
      ) : (
        <DesktopCalendarTasksSidePanel
          embedded
          pathname={pathname}
          search={search}
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
        />
      )}
    </ContentSidePanelShell>
  );
}
