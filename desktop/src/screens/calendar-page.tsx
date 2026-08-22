import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  CalendarMeetingDetailOverlay,
  CalendarView,
  buildCalendarDayHabitsByDate,
  formatMeetingDisplayId,
  mergeCalendarGridEvents,
  parseCalendarMeetingOverlayId,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  type CalendarHabitIconItem,
  type CalendarTaskPopoverTask,
  type CalendarMeetingPopoverMeeting,
  type MeetingCalendarPatch,
  type TaskCalendarPatch,
} from "@backsteros/ui";

import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useMeetingDetailViewProps } from "../lib/use-meeting-detail-props";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useDesktopWorkspaceData();

  const openMeetingId = parseCalendarMeetingOverlayId(searchParams.toString());

  const meeting = useMemo(() => {
    if (!openMeetingId) return null;
    const normalized = decodeURIComponent(openMeetingId).toLowerCase();
    return workspace.meetings.find((entry) => {
      if (entry.id === openMeetingId) return true;
      const displayId = formatMeetingDisplayId(entry.number).toLowerCase();
      return displayId === normalized;
    });
  }, [openMeetingId, workspace.meetings]);

  const displayId = meeting ? formatMeetingDisplayId(meeting.number) : null;

  useDesktopSectionBreadcrumb(
    openMeetingId && meeting
      ? [
          { label: "Calendar", href: "/calendar" },
          { label: displayId ?? meeting.title },
        ]
      : [{ label: "Calendar" }],
  );

  const setOpenMeetingId = useCallback(
    (meetingId: string | null) => {
      if (meetingId) {
        setSearchParams({ meeting: meetingId }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  const events = useMemo(
    () => mergeCalendarGridEvents(workspace.allTasks, workspace.meetings),
    [workspace.allTasks, workspace.meetings],
  );

  const dayHabitsByDate = useMemo(
    () =>
      buildCalendarDayHabitsByDate(workspace.habits, workspace.allTasks),
    [workspace.allTasks, workspace.habits],
  );

  const handleToggleDayHabit = useCallback(
    (item: CalendarHabitIconItem, completed: boolean) => {
      void workspace.patchTask(item.taskId, {
        status: completed ? "completed" : "ready_to_start",
      });
    },
    [workspace],
  );

  const tasksById = useMemo(
    () => new Map(workspace.allTasks.map((task) => [task.id, task])),
    [workspace.allTasks],
  );

  const resolveTask = useCallback(
    (taskId: string): CalendarTaskPopoverTask | null => {
      const task = tasksById.get(taskId);
      if (!task) return null;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        dueEndDate: task.dueEndDate,
        number: task.number,
        projectId: task.projectId,
        projectKey: task.projectKey,
        projectName: task.projectName,
        description: workspace.taskDescriptions[task.id] ?? null,
      };
    },
    [tasksById, workspace.taskDescriptions],
  );

  const meetingsById = useMemo(
    () => new Map(workspace.meetings.map((meeting) => [meeting.id, meeting])),
    [workspace.meetings],
  );

  const resolveMeeting = useCallback(
    (meetingId: string): CalendarMeetingPopoverMeeting | null => {
      const meeting = meetingsById.get(meetingId);
      if (!meeting) return null;
      return {
        id: meeting.id,
        title: meeting.title,
        number: meeting.number,
        summary: meeting.summary ?? null,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
      };
    },
    [meetingsById],
  );

  const patchMeeting = useCallback(
    (values: Record<string, unknown>) => {
      if (!meeting) return;
      void workspace.patchMeeting(meeting.id, values);
    },
    [meeting, workspace],
  );

  const meetingDetailProps = useMeetingDetailViewProps(
    meeting,
    workspace,
    patchMeeting,
  );

  const handleDeleteMeeting = useCallback(async () => {
    if (!meeting) {
      return { ok: false as const, error: "Meeting is required." };
    }
    try {
      await workspace.softDeleteMeeting(meeting.id);
      setOpenMeetingId(null);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete meeting.",
      };
    }
  }, [meeting, setOpenMeetingId, workspace]);

  const handleTaskReschedule = (taskId: string, patch: TaskCalendarPatch) => {
    void workspace.patchTask(taskId, patch);
  };

  const handleMeetingReschedule = (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => {
    void workspace.patchMeeting(meetingId, patch);
  };

  if (!workspace.ready) {
    return <div className="flex min-h-0 flex-1" />;
  }

  return (
    <div className="calendar-page" data-calendar-page>
      {meeting ? (
        <>
          <RegisterPageTitle
            title={displayId ? `${displayId} ${meeting.title}` : meeting.title}
          />
          <RegisterEntityDeleteAction
            entityLabel={`meeting ${displayId ?? meeting.title}`}
            onDelete={handleDeleteMeeting}
          />
        </>
      ) : null}
      <CalendarView
        events={events}
        onTaskReschedule={handleTaskReschedule}
        onMeetingReschedule={handleMeetingReschedule}
        resolveTask={resolveTask}
        resolveMeeting={resolveMeeting}
        onTaskOpen={(taskId) => navigate(`/calendar/tasks/${taskId}`)}
        onMeetingOpen={(meetingId) =>
          navigate(`/calendar/meetings/${encodeURIComponent(meetingId)}`)
        }
        dayHabitsByDate={dayHabitsByDate}
        onToggleDayHabit={handleToggleDayHabit}
      />
      <CalendarMeetingDetailOverlay
        open={Boolean(openMeetingId && meeting)}
        onClose={() => setOpenMeetingId(null)}
        displayId={displayId ?? "M-?"}
        title={meeting?.title ?? ""}
        summary={meeting?.summary ?? ""}
        notes={meeting?.notes ?? ""}
        transcription={meeting?.transcription ?? ""}
        onTitleChange={(title) => patchMeeting({ title })}
        onSummaryChange={(summary) => patchMeeting({ summary })}
        onNotesChange={(notes) => patchMeeting({ notes })}
        onTranscriptionChange={(transcription) =>
          patchMeeting({ transcription })
        }
        {...meetingDetailProps}
      />
    </div>
  );
}
