import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import {
  CalendarAvailabilityView,
  CalendarDateNav,
  CalendarMeetingDetailOverlay,
  CalendarTaskDetailOverlay,
  CalendarTimetrackingView,
  CalendarView,
  CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM,
  CALENDAR_MEETING_OVERLAY_PARAM,
  CALENDAR_PAGE_MODE_PARAM,
  CALENDAR_TASK_OVERLAY_PARAM,
  CALENDAR_TIMETRACKING_DETAIL_PANEL_WIDTH_KEY,
  CALENDAR_VIEW_MODE_PARAM,
  DEFAULT_CALENDAR_VIEW_MODE,
  buildAssigneeDropdownOptions,
  buildCalendarBreadcrumbItems,
  buildCalendarDayHabitsByDate,
  buildProjectDropdownOptions,
  collectTimetrackingEntries,
  formatMeetingBreadcrumbLabel,
  formatMeetingDisplayId,
  getSelectedCalendarGridEventId,
  getTaskDisplayId,
  MeetingDetailView,
  mergeCalendarGridEvents,
  parseCalendarMeetingOverlayId,
  parseCalendarMeetingOverlayLayout,
  parseCalendarPageModeParam,
  parseCalendarTaskOverlayId,
  parseCalendarViewModeParam,
  readTimetrackingPeriodFromSearch,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  ResizableSidePanel,
  ProjectOcticon,
  useListDismissDetailShortcut,
  useListKeyboardNavigationZone,
  useCalendarDateNavigationShortcuts,
  type CalendarHabitIconItem,
  type CalendarMeetingPopoverMeeting,
  type CalendarMeetingOverlayLayout,
  type CalendarTaskPopoverTask,
  type CalendarViewMode,
  type MeetingCalendarPatch,
  type TaskCalendarPatch,
  type TaskStatus,
  type TimetrackingEntry,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useMeetingSchedulingSettings } from "../lib/use-meeting-scheduling-settings";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useMeetingDetailViewProps } from "../lib/use-meeting-detail-props";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { TaskDetailPage } from "./task-detail-page";

/** Subset of FullCalendar API used for date-nav (matches UI CalendarDateNavApi). */
type CalendarDateNavApi = {
  prev: () => void;
  next: () => void;
  today?: () => void;
};

export function CalendarPage() {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useDesktopWorkspaceData();
  const { settings, loading: settingsLoading, setWeekdayHours } =
    useMeetingSchedulingSettings();

  const openMeetingId = parseCalendarMeetingOverlayId(searchParams.toString());
  const openTaskId = parseCalendarTaskOverlayId(searchParams.toString());
  const meetingOverlayLayout = parseCalendarMeetingOverlayLayout(
    searchParams.toString(),
  );
  const viewMode = parseCalendarViewModeParam(
    searchParams.get(CALENDAR_VIEW_MODE_PARAM),
  );
  const pageMode = parseCalendarPageModeParam(
    searchParams.get(CALENDAR_PAGE_MODE_PARAM),
  );
  const isAvailabilityMode = pageMode === "availability";
  const isTimetrackingMode = pageMode === "timetracking";
  const selectedTimetrackingPeriod = isTimetrackingMode
    ? readTimetrackingPeriodFromSearch(searchParams.toString(), {
        fallbackToday: true,
      })
    : null;
  const calendarApiRef = useRef<CalendarDateNavApi | null>(null);
  const [calendarNavReady, setCalendarNavReady] = useState(false);
  const [rangeTitle, setRangeTitle] = useState("");

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );

  const projectOptions = useMemo(
    () => buildProjectDropdownOptions(workspace.projects),
    [workspace.projects],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );

  const handleCalendarApi = useCallback((api: CalendarDateNavApi | null) => {
    calendarApiRef.current = api;
    setCalendarNavReady(api != null);
  }, []);

  const handleViewModeChange = useCallback(
    (mode: CalendarViewMode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (mode === DEFAULT_CALENDAR_VIEW_MODE) {
            next.delete(CALENDAR_VIEW_MODE_PARAM);
          } else {
            next.set(CALENDAR_VIEW_MODE_PARAM, mode);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useCalendarDateNavigationShortcuts({
    // Local CalendarDateNavApi is structurally compatible with FullCalendar's API;
    // avoid importing @fullcalendar/core from the desktop app package.
    calendarApiRef: calendarApiRef as never,
    enabled: calendarNavReady && !isTimetrackingMode,
  });

  const meeting = useMemo(() => {
    if (!openMeetingId || isAvailabilityMode) return null;
    const normalized = decodeURIComponent(openMeetingId).toLowerCase();
    return workspace.meetings.find((entry) => {
      if (entry.id === openMeetingId) return true;
      const displayId = formatMeetingDisplayId(entry.number).toLowerCase();
      return displayId === normalized;
    });
  }, [isAvailabilityMode, openMeetingId, workspace.meetings]);

  const displayId = meeting ? formatMeetingDisplayId(meeting.number) : null;

  const meetingDetailLabel = meeting
    ? formatMeetingBreadcrumbLabel(meeting.number, meeting.title)
    : null;

  const openTask = useMemo(() => {
    if (!openTaskId || isAvailabilityMode) return null;
    const normalized = decodeURIComponent(openTaskId).toLowerCase();
    return workspace.allTasks.find((entry) => {
      if (entry.id === openTaskId) return true;
      const displayId = getTaskDisplayId(
        {
          number: entry.number,
          projectId: entry.projectId,
        },
        entry.projectKey,
      );
      return displayId?.toLowerCase() === normalized;
    });
  }, [isAvailabilityMode, openTaskId, workspace.allTasks]);

  const taskDetailLabel = openTask
    ? getTaskDisplayId(
        {
          number: openTask.number,
          projectId: openTask.projectId,
        },
        openTask.projectKey,
      )
      ? `${getTaskDisplayId(
          {
            number: openTask.number,
            projectId: openTask.projectId,
          },
          openTask.projectKey,
        )} ${openTask.title}`
      : openTask.title
    : null;

  const dateNav = useMemo(
    () => (
      <CalendarDateNav
        disabled={!calendarNavReady}
        onPrev={() => calendarApiRef.current?.prev()}
        onNext={() => calendarApiRef.current?.next()}
        onToday={() => calendarApiRef.current?.today()}
      />
    ),
    [calendarNavReady],
  );

  useDesktopSectionBreadcrumb(
    buildCalendarBreadcrumbItems({
      viewMode,
      pageMode,
      rangeTitle,
      detailLabel:
        openMeetingId && meeting
          ? meetingDetailLabel
          : openTaskId && openTask
            ? taskDetailLabel
            : null,
    }),
    { actions: isTimetrackingMode ? undefined : dateNav },
  );


  const setOpenMeetingId = useCallback(
    (meetingId: string | null, layout: CalendarMeetingOverlayLayout = "panel") => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(CALENDAR_TASK_OVERLAY_PARAM);
          if (meetingId) {
            next.set(CALENDAR_MEETING_OVERLAY_PARAM, meetingId);
            if (layout === "page") {
              next.set(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM, "page");
            } else {
              next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
            }
          } else {
            next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
            next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setOpenTaskId = useCallback(
    (taskId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
          next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
          if (taskId) {
            next.set(CALENDAR_TASK_OVERLAY_PARAM, taskId);
          } else {
            next.delete(CALENDAR_TASK_OVERLAY_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openMeetingFromGrid = useCallback(
    (meetingId: string) => {
      setOpenMeetingId(meetingId, "panel");
    },
    [setOpenMeetingId],
  );

  const openTaskFromGrid = useCallback(
    (taskId: string) => {
      setOpenTaskId(taskId);
    },
    [setOpenTaskId],
  );

  const setMeetingOverlayLayout = useCallback(
    (layout: CalendarMeetingOverlayLayout) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.get(CALENDAR_MEETING_OVERLAY_PARAM)) {
            return prev;
          }
          if (layout === "page") {
            next.set(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM, "page");
          } else {
            next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const events = useMemo(() => {
    const habitIconById = new Map(
      workspace.habits.map((habit) => [habit.id, habit.icon ?? null] as const),
    );
    const tasksWithHabitIcons = workspace.allTasks.map((task) => {
      const habitId = task.habitId?.trim() || null;
      if (!habitId) return task;
      return {
        ...task,
        habitIcon: habitIconById.get(habitId) ?? null,
      };
    });
    return mergeCalendarGridEvents(tasksWithHabitIcons, workspace.meetings);
  }, [workspace.allTasks, workspace.habits, workspace.meetings]);

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

  const handleCreateMeetingFromSelect = useCallback(
    (range: { startAt: string; endAt: string }) => {
      void workspace
        .createMeeting({
          title: "New meeting",
          status: "triage",
          startAt: range.startAt,
          endAt: range.endAt,
        })
        .then((created) => {
          setOpenMeetingId(created.id, "panel");
        });
    },
    [setOpenMeetingId, workspace],
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
        status: meeting.status ?? null,
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

  const timetrackingEntries = useMemo(
    () =>
      collectTimetrackingEntries({
        tasks: workspace.allTasks.map((task) => ({
          id: task.id,
          title: task.title,
          number: task.number,
          displayId: getTaskDisplayId(
            {
              number: task.number,
              projectId: task.projectId,
            },
            task.projectKey,
          ),
          trackedDurationSeconds: task.trackedDurationSeconds ?? null,
          scheduleAt: task.dueDate,
        })),
        meetings: workspace.meetings.map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          number: meeting.number,
          displayId: formatMeetingDisplayId(meeting.number),
          trackedDurationSeconds: meeting.trackedDurationSeconds ?? null,
          scheduleAt: meeting.startAt,
        })),
        taskHref: (id) => `/calendar?${CALENDAR_PAGE_MODE_PARAM}=timetracking&${CALENDAR_TASK_OVERLAY_PARAM}=${encodeURIComponent(id)}`,
        meetingHref: (id) =>
          `/calendar?${CALENDAR_PAGE_MODE_PARAM}=timetracking&${CALENDAR_MEETING_OVERLAY_PARAM}=${encodeURIComponent(id)}`,
        period: selectedTimetrackingPeriod,
      }),
    [
      selectedTimetrackingPeriod,
      workspace.allTasks,
      workspace.meetings,
    ],
  );

  const closeTimetrackingDetail = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
        next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
        next.delete(CALENDAR_TASK_OVERLAY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const { setActiveZone } = useListKeyboardNavigationZone();
  const dismissTimetrackingDetail = useCallback(() => {
    const returnId = openTask?.id ?? meeting?.id ?? null;
    closeTimetrackingDetail();
    if (!returnId) return;
    queueMicrotask(() => {
      setActiveZone("main", {
        activate: true,
        preferSidepanelForJk: false,
        highlightItemId: returnId,
      });
    });
  }, [closeTimetrackingDetail, meeting?.id, openTask?.id, setActiveZone]);

  const handleTimetrackingEntryOpen = useCallback(
    (entry: TimetrackingEntry) => {
      if (entry.kind === "task") {
        if (openTaskId === entry.id) {
          setOpenTaskId(null);
          return;
        }
        setOpenTaskId(entry.id);
        return;
      }
      if (openMeetingId === entry.id) {
        setOpenMeetingId(null);
        return;
      }
      setOpenMeetingId(entry.id, "panel");
    },
    [openMeetingId, openTaskId, setOpenMeetingId, setOpenTaskId],
  );

  const timetrackingDetailOpen = Boolean(
    isTimetrackingMode && (meeting || openTask),
  );

  useListDismissDetailShortcut({
    enabled: timetrackingDetailOpen,
    onDismiss: dismissTimetrackingDetail,
  });

  const handleTimetrackingTaskStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      void workspace.patchTask(taskId, { status });
    },
    [workspace],
  );

  const handleTimetrackingTaskPriorityChange = useCallback(
    (taskId: string, priority: number) => {
      void workspace.patchTask(taskId, { priority });
    },
    [workspace],
  );

  const handleTimetrackingTaskDueDateChange = useCallback(
    (taskId: string, dueDate: Date | null) => {
      void workspace.patchTask(taskId, {
        dueDate: dueDate ? dueDate.toISOString() : null,
      });
    },
    [workspace],
  );

  const handleTimetrackingTaskAssigneeChange = useCallback(
    (taskId: string, assigneeId: string | null) => {
      void workspace.patchTask(taskId, { assigneeId });
    },
    [workspace],
  );

  const handleTimetrackingTaskProjectChange = useCallback(
    (taskId: string, projectKey: string | null) => {
      const project = projectKey
        ? workspace.projects.find((entry) => entry.key === projectKey) ?? null
        : null;
      void workspace.patchTask(taskId, {
        projectId: project?.id ?? null,
      });
    },
    [workspace],
  );

  const search = searchParams.toString();

  const selectedGridEventId = useMemo(
    () => getSelectedCalendarGridEventId(pathname, search),
    [pathname, search],
  );

  if (!workspace.ready) {
    return <div className="flex min-h-0 flex-1" />;
  }


  return (
    <div className="calendar-page" data-calendar-page data-calendar-page-mode={pageMode}>
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
      {isTimetrackingMode ? (
        <div
          className={[
            "journal-day-layout",
            "desktop-journal-day-layout",
            "calendar-timetracking-layout",
            timetrackingDetailOpen ? null : "is-detail-closed",
          ]
            .filter(Boolean)
            .join(" ")}
          data-content-detail
          data-detail-split
          data-timetracking-detail={timetrackingDetailOpen ? "open" : "closed"}
        >
          <div className="journal-day-layout__main">
            <CalendarTimetrackingView
              key="timetracking-detail-side-panel"
              entries={timetrackingEntries}
              tasks={workspace.allTasks}
              meetings={workspace.meetings}
              period={selectedTimetrackingPeriod}
              selectedEntryId={openTask?.id ?? meeting?.id ?? null}
              onEntryOpen={handleTimetrackingEntryOpen}
              projectOptions={projectOptions}
              assigneeOptions={assigneeOptions}
              onTaskStatusChange={handleTimetrackingTaskStatusChange}
              onTaskPriorityChange={handleTimetrackingTaskPriorityChange}
              onTaskDueDateChange={handleTimetrackingTaskDueDateChange}
              onTaskAssigneeChange={handleTimetrackingTaskAssigneeChange}
              onTaskProjectChange={handleTimetrackingTaskProjectChange}
            />
          </div>
          {timetrackingDetailOpen ? (
            <ResizableSidePanel
              storageKey={CALENDAR_TIMETRACKING_DETAIL_PANEL_WIDTH_KEY}
              defaultWidth={440}
              minWidth={320}
              maxWidth={720}
              edge="start"
              className="journal-day-layout__calendar calendar-timetracking-detail-panel"
            >
              <div className="desktop-journal-day-layout__chrome">
                <div className="desktop-agent-surface-tab-actions">
                  <button
                    type="button"
                    className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                    onClick={dismissTimetrackingDetail}
                    title="Close details (Esc)"
                    aria-label="Close details"
                  >
                    <ProjectOcticon icon="x" size={14} />
                  </button>
                </div>
              </div>
              <div className="desktop-journal-day-layout__calendar-body calendar-timetracking-detail-panel__body">
                {meeting ? (
                  <MeetingDetailView
                    layout="panel"
                    displayId={displayId ?? "M-?"}
                    title={meeting.title}
                    summary={meeting.summary ?? ""}
                    notes={meeting.notes ?? ""}
                    transcription={meeting.transcription ?? ""}
                    onTitleChange={(title) => patchMeeting({ title })}
                    onSummaryChange={(summary) => patchMeeting({ summary })}
                    onNotesChange={(notes) => patchMeeting({ notes })}
                    onTranscriptionChange={(transcription) =>
                      patchMeeting({ transcription })
                    }
                    {...meetingDetailProps}
                  />
                ) : openTask ? (
                  <TaskDetailPage
                    taskRouteParam={openTask.id}
                    overlayMode
                  />
                ) : null}
              </div>
            </ResizableSidePanel>
          ) : null}
        </div>
      ) : isAvailabilityMode && settings ? (
        <CalendarAvailabilityView
          weekdayHours={settings.weekdayHours}
          timezone={settings.timezone}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onWeekdayHoursChange={setWeekdayHours}
          onCalendarApi={handleCalendarApi}
          onRangeTitleChange={setRangeTitle}
        />
      ) : isAvailabilityMode ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {settingsLoading ? "Loading availability…" : "Unable to load availability settings."}
        </div>
      ) : (
        <CalendarView
          events={events}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onCalendarApi={handleCalendarApi}
          onRangeTitleChange={setRangeTitle}
          selectedGridEventId={selectedGridEventId}
          keyboardNavigationEnabled={!openMeetingId && !openTaskId}
          bookingAvailability={
            settings
              ? {
                  weekdayHours: settings.weekdayHours,
                  timezone: settings.timezone,
                }
              : undefined
          }
          onTaskReschedule={handleTaskReschedule}
          onMeetingReschedule={handleMeetingReschedule}
          onCreateMeetingFromSelect={handleCreateMeetingFromSelect}
          resolveTask={resolveTask}
          resolveMeeting={resolveMeeting}
          onTaskOpen={openTaskFromGrid}
          onMeetingOpen={openMeetingFromGrid}
          dayHabitsByDate={dayHabitsByDate}
          onToggleDayHabit={handleToggleDayHabit}
        />
      )}
      <CalendarMeetingDetailOverlay
        open={Boolean(!isTimetrackingMode && openMeetingId && meeting)}
        overlayLayout={meetingOverlayLayout}
        onClose={() => setOpenMeetingId(null)}
        onExpand={() => setMeetingOverlayLayout("page")}
        onCollapse={() => setMeetingOverlayLayout("panel")}
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
        trackedTimerHref={
          meeting ? `${pathname}?${searchParams.toString()}` : null
        }
        timerEntityId={meeting?.id ?? null}
        {...meetingDetailProps}
      />
      <CalendarTaskDetailOverlay
        open={Boolean(!isTimetrackingMode && openTaskId && openTask)}
        onClose={() => setOpenTaskId(null)}
        ariaLabel={
          openTask?.title?.trim()
            ? `Task ${openTask.title}`
            : "Task details"
        }
      >
        {openTaskId && openTask ? (
          <TaskDetailPage
            taskRouteParam={openTask.id}
            overlayMode
            onOverlayClose={() => setOpenTaskId(null)}
            onOverlayTaskReplace={setOpenTaskId}
          />
        ) : null}
      </CalendarTaskDetailOverlay>
    </div>
  );
}
