"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CalendarApi,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import interactionPlugin, {
  type EventDragStartArg,
  type EventDragStopArg,
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

import { parseYmdLocal, formatLocalYmd } from "../../tasks/task-due-date.js";
import {
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
  calendarEntityFromEvent,
  isCalendarMeetingDuplicateModifier,
  type MeetingCalendarPatch,
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
  onMeetingReschedule?: (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => void | Promise<void>;
  /**
   * Alt/Option + drag-drop a meeting → create a copy at the new slot.
   * Copy only when Alt is held at drop (releasing mid-drag moves instead).
   */
  onMeetingDuplicate?: (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => void | Promise<void>;
  resolveTask?: (taskId: string) => CalendarTaskPopoverTask | null | undefined;
  onTaskOpen?: (taskId: string) => void;
  onMeetingOpen?: (meetingId: string) => void;
};

type OpenPopoverState = {
  task: CalendarTaskPopoverTask;
  anchorRect: DOMRect;
};

export function CalendarDayTimeline({
  dateSlug,
  events,
  onTaskReschedule,
  onMeetingReschedule,
  onMeetingDuplicate,
  resolveTask,
  onTaskOpen,
  onMeetingOpen,
}: CalendarDayTimelineProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const meetingDragCopyCleanupRef = useRef<(() => void) | null>(null);
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
    // Keep-alive panes toggle `content-visibility: hidden`, which collapses this
    // container to 0×0 and snaps it back to the *same* size on reveal. Calling
    // `updateSize()` on that round-trip forces a full FullCalendar relayout on
    // every reveal (the dominant cost when re-entering Journal/Calendar). Only
    // resize on a genuine, non-zero size change so a same-size reveal just
    // repaints the already-laid-out grid.
    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      calendarApiRef.current?.updateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const api = calendarApiRef.current;
    if (!api) return;
    // FullCalendar gotoDate uses flushSync — defer out of the passive effect turn.
    const frame = requestAnimationFrame(() => {
      api.gotoDate(initialDate);
    });
    return () => cancelAnimationFrame(frame);
  }, [dateSlug, initialDate]);

  useEffect(() => {
    return () => {
      meetingDragCopyCleanupRef.current?.();
      meetingDragCopyCleanupRef.current = null;
      document.body.classList.remove("calendar-event-drag-copy");
    };
  }, []);

  const closePopover = () => setOpenPopover(null);

  const clearMeetingDragCopyAffordance = () => {
    meetingDragCopyCleanupRef.current?.();
    meetingDragCopyCleanupRef.current = null;
    document.body.classList.remove("calendar-event-drag-copy");
  };

  const handleDatesSet = (info: DatesSetArg) => {
    const viewStart = info.view.currentStart;
    const viewYmd = `${viewStart.getFullYear()}-${String(
      viewStart.getMonth() + 1,
    ).padStart(2, "0")}-${String(viewStart.getDate()).padStart(2, "0")}`;
    if (viewYmd !== dateSlug) {
      requestAnimationFrame(() => {
        info.view.calendar.gotoDate(initialDate);
      });
    }
    closePopover();
  };

  const applyScheduleChange = (
    event: {
      id: string;
      start: Date | null;
      end: Date | null;
      allDay: boolean;
      extendedProps: Record<string, unknown>;
    },
    revert: () => void,
    options?: { duplicate?: boolean },
  ) => {
    const entity = calendarEntityFromEvent(event);
    if (entity.entityType === "meeting") {
      const patch = calendarChangeToMeetingPatch({
        start: event.start,
        end: event.end,
        allDay: event.allDay,
      });
      if (!patch) {
        revert();
        return;
      }
      if (options?.duplicate) {
        if (!onMeetingDuplicate) {
          revert();
          return;
        }
        revert();
        void Promise.resolve(onMeetingDuplicate(entity.entityId, patch));
        return;
      }
      if (!onMeetingReschedule) {
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

  const handleEventDragStart = (info: EventDragStartArg) => {
    clearMeetingDragCopyAffordance();
    if (
      !onMeetingDuplicate ||
      info.event.extendedProps.entityType !== "meeting"
    ) {
      return;
    }
    const setCopyCursor = (copy: boolean) => {
      document.body.classList.toggle("calendar-event-drag-copy", copy);
    };
    setCopyCursor(isCalendarMeetingDuplicateModifier(info.jsEvent));
    const onModifierChange = (event: KeyboardEvent) => {
      setCopyCursor(event.altKey);
    };
    window.addEventListener("keydown", onModifierChange);
    window.addEventListener("keyup", onModifierChange);
    meetingDragCopyCleanupRef.current = () => {
      window.removeEventListener("keydown", onModifierChange);
      window.removeEventListener("keyup", onModifierChange);
    };
  };

  const handleEventDragStop = (_info: EventDragStopArg) => {
    clearMeetingDragCopyAffordance();
  };

  const handleEventDrop = (info: EventDropArg) => {
    closePopover();
    clearMeetingDragCopyAffordance();
    applyScheduleChange(info.event, () => info.revert(), {
      duplicate: isCalendarMeetingDuplicateModifier(info.jsEvent),
    });
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    closePopover();
    applyScheduleChange(info.event, () => info.revert());
  };

  const handleEventReceive = (info: EventReceiveArg) => {
    closePopover();
    const entity = calendarEntityFromEvent(info.event);
    if (entity.entityType === "meeting") {
      info.revert();
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
    void Promise.resolve(onTaskReschedule(entity.entityId, patch)).finally(
      () => {
        info.revert();
      },
    );
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const entity = calendarEntityFromEvent(info.event);
    if (entity.entityType === "meeting") {
      onMeetingOpen?.(entity.entityId);
      return;
    }
    if (resolveTask) {
      const task = resolveTask(entity.entityId);
      if (task) {
        setOpenPopover({ task, anchorRect: info.el.getBoundingClientRect() });
        return;
      }
    }
    onTaskOpen?.(entity.entityId);
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
          eventDragStart={handleEventDragStart}
          eventDragStop={handleEventDragStop}
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
