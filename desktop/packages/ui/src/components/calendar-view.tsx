"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CalendarApi,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

import {
  CALENDAR_VIEW_MODE_OPTIONS,
  calendarViewModeToFcView,
  fcViewTypeToCalendarViewMode,
  type CalendarViewMode,
} from "../calendar-view-modes.js";
import {
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
  calendarEntityFromEvent,
  type MeetingCalendarPatch,
  type TaskCalendarEvent,
  type TaskCalendarPatch,
} from "../calendar-events.js";
import {
  CalendarMeetingEventPopover,
  type CalendarMeetingPopoverMeeting,
} from "./calendar-meeting-event-popover.js";
import {
  CalendarTaskEventPopover,
  type CalendarTaskPopoverTask,
} from "./calendar-task-event-popover.js";
import { renderCalendarTaskEventContent } from "./calendar-task-event-content.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import type { CalendarHabitIconItem } from "./calendar-habits-icon-row.js";
import { useCalendarDayHabitMounts } from "./use-calendar-day-habit-mounts.js";

export type CalendarViewProps = {
  events: TaskCalendarEvent[];
  onTaskReschedule: (
    taskId: string,
    patch: TaskCalendarPatch,
  ) => void | Promise<void>;
  onMeetingReschedule?: (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => void | Promise<void>;
  /** When set, clicking a calendar task opens an anchored detail popover. */
  resolveTask?: (taskId: string) => CalendarTaskPopoverTask | null | undefined;
  /** When set, clicking a calendar meeting opens an anchored detail popover. */
  resolveMeeting?: (
    meetingId: string,
  ) => CalendarMeetingPopoverMeeting | null | undefined;
  onTaskOpen?: (taskId: string) => void;
  /** Opens the full-height meeting panel (side panel list, popover footer). */
  onMeetingOpen?: (meetingId: string) => void;
  /** Habit day tasks keyed by local `YYYY-MM-DD` (shown above each day's events). */
  dayHabitsByDate?: ReadonlyMap<string, readonly CalendarHabitIconItem[]>;
  onToggleDayHabit?: (
    item: CalendarHabitIconItem,
    completed: boolean,
  ) => void;
};

type OpenTaskPopoverState = {
  task: CalendarTaskPopoverTask;
  anchorRect: DOMRect;
};

type OpenMeetingPopoverState = {
  meeting: CalendarMeetingPopoverMeeting;
  anchorRect: DOMRect;
};

function taskIdFromEvent(event: {
  id: string;
  extendedProps: Record<string, unknown>;
}): string {
  const entity = calendarEntityFromEvent(event);
  return entity.entityId;
}

export function CalendarView({
  events,
  onTaskReschedule,
  onMeetingReschedule,
  resolveTask,
  resolveMeeting,
  onTaskOpen,
  onMeetingOpen,
  dayHabitsByDate,
  onToggleDayHabit,
}: CalendarViewProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [openTaskPopover, setOpenTaskPopover] =
    useState<OpenTaskPopoverState | null>(null);
  const [openMeetingPopover, setOpenMeetingPopover] =
    useState<OpenMeetingPopoverState | null>(null);
  const fixedMirrorParent =
    typeof document !== "undefined" ? document.body : undefined;

  const {
    dayCellDidMount,
    dayCellWillUnmount,
    dayHeaderDidMount,
    dayHeaderWillUnmount,
    syncListDayHabits,
  } = useCalendarDayHabitMounts(dayHabitsByDate ?? new Map(), onToggleDayHabit);

  useEffect(() => {
    if (viewMode !== "list") return;
    syncListDayHabits(mainRef.current);
  }, [viewMode, dayHabitsByDate, syncListDayHabits]);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      calendarApiRef.current?.updateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const closePopovers = () => {
    setOpenTaskPopover(null);
    setOpenMeetingPopover(null);
  };

  const handleDatesSet = (info: DatesSetArg) => {
    setViewMode(fcViewTypeToCalendarViewMode(info.view.type));
    closePopovers();
    if (info.view.type === "listWeek") {
      requestAnimationFrame(() => syncListDayHabits(mainRef.current));
    }
  };

  const handleViewModeChange = (mode: CalendarViewMode) => {
    const api = calendarApiRef.current;
    if (!api) return;
    api.changeView(calendarViewModeToFcView(mode));
    setViewMode(mode);
    closePopovers();
  };

  const applyCalendarChange = (
    event: EventDropArg["event"] | EventResizeDoneArg["event"],
    revert: () => void,
  ) => {
    const entity = calendarEntityFromEvent(event);
    if (entity.entityType === "meeting") {
      const patch = calendarChangeToMeetingPatch({
        start: event.start,
        end: event.end,
        allDay: event.allDay,
      });
      if (!patch || !onMeetingReschedule) {
        revert();
        return;
      }
      void Promise.resolve(
        onMeetingReschedule(entity.entityId, patch),
      ).catch(() => revert());
      return;
    }
    const patch = calendarChangeToTaskPatch({
      start: event.start,
      end: event.end,
      allDay: event.allDay,
    });
    if (!patch) {
      revert();
      return;
    }
    void Promise.resolve(onTaskReschedule(entity.entityId, patch)).catch(() =>
      revert(),
    );
  };

  const handleEventDrop = (info: EventDropArg) => {
    closePopovers();
    applyCalendarChange(info.event, () => info.revert());
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    closePopovers();
    applyCalendarChange(info.event, () => info.revert());
  };

  const handleEventReceive = (info: EventReceiveArg) => {
    closePopovers();
    const entity = calendarEntityFromEvent(info.event);
    if (entity.entityType === "meeting") {
      const patch = calendarChangeToMeetingPatch({
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay,
      });
      if (!patch || !entity.entityId || !onMeetingReschedule) {
        info.revert();
        return;
      }
      void Promise.resolve(
        onMeetingReschedule(entity.entityId, patch),
      ).finally(() => {
        info.revert();
      });
      return;
    }
    const patch = calendarChangeToTaskPatch({
      start: info.event.start,
      end: info.event.end,
      allDay: info.event.allDay,
    });
    if (!patch || !entity.entityId) {
      info.revert();
      return;
    }
    void Promise.resolve(onTaskReschedule(entity.entityId, patch)).finally(() => {
      info.revert();
    });
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const entity = calendarEntityFromEvent(info.event);
    if (entity.entityType === "meeting") {
      if (resolveMeeting) {
        const meeting = resolveMeeting(entity.entityId);
        if (meeting) {
          closePopovers();
          setOpenMeetingPopover({
            meeting,
            anchorRect: info.el.getBoundingClientRect(),
          });
          return;
        }
      }
      onMeetingOpen?.(entity.entityId);
      return;
    }
    if (resolveTask) {
      const task = resolveTask(entity.entityId);
      if (task) {
        closePopovers();
        setOpenTaskPopover({
          task,
          anchorRect: info.el.getBoundingClientRect(),
        });
        return;
      }
    }
    onTaskOpen?.(entity.entityId);
  };

  const popoverTask =
    openTaskPopover && resolveTask
      ? (resolveTask(openTaskPopover.task.id) ?? openTaskPopover.task)
      : openTaskPopover?.task;

  const popoverMeeting =
    openMeetingPopover && resolveMeeting
      ? (resolveMeeting(openMeetingPopover.meeting.id) ??
        openMeetingPopover.meeting)
      : openMeetingPopover?.meeting;

  return (
    <div className="calendar-view" data-calendar-view>
      <div className="calendar-view-main" ref={mainRef}>
        <FullCalendar
          ref={(instance) => {
            calendarApiRef.current = instance?.getApi() ?? null;
          }}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          height="100%"
          expandRows
          firstDay={1}
          nowIndicator
          dayMaxEventRows
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          fixedMirrorParent={fixedMirrorParent}
          editable
          eventStartEditable
          eventDurationEditable
          eventResizableFromStart
          droppable
          events={events}
          datesSet={handleDatesSet}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventReceive={handleEventReceive}
          eventClick={handleEventClick}
          eventContent={renderCalendarTaskEventContent}
          dayCellDidMount={dayCellDidMount}
          dayCellWillUnmount={dayCellWillUnmount}
          dayHeaderDidMount={dayHeaderDidMount}
          dayHeaderWillUnmount={dayHeaderWillUnmount}
        />
        <FloatingPillToggleDock className="calendar-view-mode-dock">
          <SegmentedPillToggle
            value={viewMode}
            options={CALENDAR_VIEW_MODE_OPTIONS}
            onChange={handleViewModeChange}
            ariaLabel="Calendar view mode"
          />
        </FloatingPillToggleDock>
      </div>
      <CalendarTaskEventPopover
        open={openTaskPopover != null}
        task={popoverTask ?? null}
        anchorRect={openTaskPopover?.anchorRect ?? null}
        onClose={() => setOpenTaskPopover(null)}
        onOpenTask={onTaskOpen}
      />
      <CalendarMeetingEventPopover
        open={openMeetingPopover != null}
        meeting={popoverMeeting ?? null}
        anchorRect={openMeetingPopover?.anchorRect ?? null}
        onClose={() => setOpenMeetingPopover(null)}
        onOpenMeeting={onMeetingOpen}
      />
    </div>
  );
}
