"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CalendarApi,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import interactionPlugin, {
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

import { parseYmdLocal, formatLocalYmd } from "../../tasks/task-due-date.js";
import {
  calendarChangeToTaskPatch,
  calendarEntityFromEvent,
  type TaskCalendarEvent,
  type TaskCalendarPatch,
} from "../../calendar/calendar-events.js";
import {
  CalendarTaskEventPopover,
  type CalendarTaskPopoverTask,
} from "./calendar-task-event-popover.js";
import { renderCalendarTaskEventContent } from "./calendar-task-event-content.js";

export type CalendarDayTimelineProps = {
  /** Local calendar day (`YYYY-MM-DD`) for this column. */
  dateSlug: string;
  events: TaskCalendarEvent[];
  onTaskReschedule: (
    taskId: string,
    patch: TaskCalendarPatch,
  ) => void | Promise<void>;
  resolveTask?: (taskId: string) => CalendarTaskPopoverTask | null | undefined;
  onTaskOpen?: (taskId: string) => void;
};

type OpenPopoverState = {
  task: CalendarTaskPopoverTask;
  anchorRect: DOMRect;
};

function taskIdFromEvent(event: {
  id: string;
  extendedProps: Record<string, unknown>;
}): string {
  return calendarEntityFromEvent(event).entityId;
}

export function CalendarDayTimeline({
  dateSlug,
  events,
  onTaskReschedule,
  resolveTask,
  onTaskOpen,
}: CalendarDayTimelineProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const [openPopover, setOpenPopover] = useState<OpenPopoverState | null>(null);
  const initialDate = parseYmdLocal(dateSlug) ?? new Date();
  const fixedMirrorParent =
    typeof document !== "undefined" ? document.body : undefined;

  const handleEventAllow = (dropInfo: { start: Date | null }) => {
    if (!dropInfo.start) return false;
    return formatLocalYmd(dropInfo.start) === dateSlug;
  };

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      calendarApiRef.current?.updateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const api = calendarApiRef.current;
    if (!api) return;
    api.gotoDate(initialDate);
  }, [dateSlug, initialDate]);

  const closePopover = () => setOpenPopover(null);

  const handleDatesSet = (info: DatesSetArg) => {
    const viewStart = info.view.currentStart;
    const viewYmd = `${viewStart.getFullYear()}-${String(
      viewStart.getMonth() + 1,
    ).padStart(2, "0")}-${String(viewStart.getDate()).padStart(2, "0")}`;
    if (viewYmd !== dateSlug) {
      info.view.calendar.gotoDate(initialDate);
    }
    closePopover();
  };

  const handleEventDrop = (info: EventDropArg) => {
    closePopover();
    const patch = calendarChangeToTaskPatch({
      start: info.event.start,
      end: info.event.end,
      allDay: info.event.allDay,
    });
    if (!patch) {
      info.revert();
      return;
    }
    onTaskReschedule(taskIdFromEvent(info.event), patch);
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    closePopover();
    const patch = calendarChangeToTaskPatch({
      start: info.event.start,
      end: info.event.end,
      allDay: info.event.allDay,
    });
    if (!patch) {
      info.revert();
      return;
    }
    onTaskReschedule(taskIdFromEvent(info.event), patch);
  };

  const handleEventReceive = (info: EventReceiveArg) => {
    closePopover();
    const taskId = taskIdFromEvent(info.event);
    const patch = calendarChangeToTaskPatch({
      start: info.event.start,
      end: info.event.end,
      allDay: info.event.allDay,
    });
    if (!patch || !taskId) {
      info.revert();
      return;
    }
    void Promise.resolve(onTaskReschedule(taskId, patch)).finally(() => {
      info.revert();
    });
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const taskId = taskIdFromEvent(info.event);
    if (resolveTask) {
      const task = resolveTask(taskId);
      if (task) {
        setOpenPopover({ task, anchorRect: info.el.getBoundingClientRect() });
        return;
      }
    }
    onTaskOpen?.(taskId);
  };

  const popoverTask =
    openPopover && resolveTask
      ? (resolveTask(openPopover.task.id) ?? openPopover.task)
      : openPopover?.task;

  return (
    <div className="calendar-day-timeline calendar-view" data-journal-day-calendar>
      <div className="calendar-view-main calendar-day-timeline-main" ref={mainRef}>
        <FullCalendar
          ref={(instance) => {
            calendarApiRef.current = instance?.getApi() ?? null;
          }}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          initialDate={initialDate}
          headerToolbar={false}
          height="100%"
          expandRows
          nowIndicator
          dayHeaders={false}
          allDaySlot={false}
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          fixedMirrorParent={fixedMirrorParent}
          editable
          eventStartEditable
          eventDurationEditable
          eventResizableFromStart
          droppable
          eventAllow={handleEventAllow}
          events={events}
          datesSet={handleDatesSet}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventReceive={handleEventReceive}
          eventClick={handleEventClick}
          eventContent={renderCalendarTaskEventContent}
        />
      </div>
      <CalendarTaskEventPopover
        open={openPopover != null}
        task={popoverTask ?? null}
        anchorRect={openPopover?.anchorRect ?? null}
        onClose={closePopover}
        onOpenTask={onTaskOpen}
      />
    </div>
  );
}
