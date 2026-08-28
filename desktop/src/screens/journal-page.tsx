import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CalendarDayTimeline,
  buildJournalDayTaskModel,
  buildJournalTaskTrailHref,
  formatJournalEntryTitle,
  getCalendarMeetingOverlayHref,
  getTodayJournalDateSlug,
  meetingsToCalendarEventsForDate,
  tasksToCalendarEvents,
  type JournalDayTaskModel,
  type MeetingCalendarPatch,
  type TaskCalendarPatch,
  type TaskItemRowTask,
} from "@backsteros/ui";

import { DesktopJournalDayLayout } from "../components/desktop-journal-day-layout";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useKeepAliveActive,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";
import { JournalDayEntryMain } from "./journal-day-entry-main";

/** Cached once — constructing DateTimeFormat only to read the zone is wasteful. */
const JOURNAL_CALENDAR_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const EMPTY_JOURNAL_DAY_MODEL: JournalDayTaskModel<TaskItemRowTask> = {
  dueTasks: [],
  dayHabitTasks: [],
  dayTasks: [],
  habitItems: [],
};

/**
 * Journal day page (`/journal`, `/journal/$dateSlug`).
 */
export function JournalPage() {
  const { dateSlug: rawSlug } = useShellParams() as { dateSlug?: string };
  const dateSlug = rawSlug ?? getTodayJournalDateSlug();
  const displayTitle = useMemo(
    () => formatJournalEntryTitle(dateSlug),
    [dateSlug],
  );

  const keepAliveActive = useKeepAliveActive();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { habits } = useDesktopWorkspaceMeta();

  const dayModel = useMemo(() => {
    if (!keepAliveActive) return EMPTY_JOURNAL_DAY_MODEL;
    return buildJournalDayTaskModel(
      allTasks,
      habits,
      dateSlug,
      JOURNAL_CALENDAR_TIME_ZONE,
    );
  }, [allTasks, dateSlug, habits, keepAliveActive]);

  useDesktopSectionBreadcrumb(
    rawSlug
      ? [
          { label: "Journal", href: "/journal" },
          { label: displayTitle },
        ]
      : [{ label: "Journal" }],
    { enabled: keepAliveActive },
  );

  return (
    <DesktopJournalDayLayout
      main={
        <JournalDayEntryMain dateSlug={dateSlug} dayModel={dayModel} />
      }
      dayCalendar={
        <JournalDayCalendarColumn dateSlug={dateSlug} dayModel={dayModel} />
      }
    />
  );
}

function JournalDayCalendarColumn({
  dateSlug,
  dayModel,
}: {
  dateSlug: string;
  dayModel: JournalDayTaskModel<TaskItemRowTask>;
}) {
  const location = useShellLocation();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const { allTasks } = useDesktopWorkspaceTasks();
  const { contacts } = useDesktopWorkspacePeople();
  const { habits, meetings } = useDesktopWorkspaceMeta();
  const { patchTask, patchMeeting } = useDesktopWorkspaceActions();
  const calendarTimeZone = JOURNAL_CALENDAR_TIME_ZONE;

  const events = useMemo(() => {
    const habitIconById = new Map(
      habits.map((habit) => [habit.id, habit.icon ?? null] as const),
    );
    const tasksWithHabitIcons = dayModel.dayTasks.map((task) => {
      const habitId = task.habitId?.trim() || null;
      if (!habitId) return task;
      return {
        ...task,
        habitIcon: habitIconById.get(habitId) ?? null,
      };
    });
    return [
      ...tasksToCalendarEvents(tasksWithHabitIcons),
      ...meetingsToCalendarEventsForDate(
        meetings,
        dateSlug,
        calendarTimeZone,
      ),
    ];
  }, [calendarTimeZone, dateSlug, dayModel.dayTasks, habits, meetings]);

  const handleReschedule = (taskId: string, patch: TaskCalendarPatch) => {
    void patchTask(taskId, patch);
  };

  const handleMeetingReschedule = (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => {
    void patchMeeting(meetingId, patch);
  };

  const handleTaskOpen = useCallback(
    (taskId: string) => {
      const task = allTasks.find((entry) => entry.id === taskId);
      if (!task) return;
      const contact = task.contactId
        ? contacts.find((entry) => entry.id === task.contactId)
        : null;
      navigate(
        buildJournalTaskTrailHref(location.pathname, {
          id: task.id,
          number: task.number,
          projectKey: task.projectKey,
          contactKey: contact?.key ?? null,
        }),
      );
    },
    [allTasks, contacts, location.pathname, navigate],
  );

  const handleMeetingOpen = useCallback(
    (meetingId: string) => {
      navigate(getCalendarMeetingOverlayHref(meetingId));
    },
    [navigate],
  );

  return (
    <CalendarDayTimeline
      dateSlug={dateSlug}
      events={events}
      onTaskReschedule={handleReschedule}
      onMeetingReschedule={handleMeetingReschedule}
      onTaskOpen={handleTaskOpen}
      onMeetingOpen={handleMeetingOpen}
    />
  );
}
