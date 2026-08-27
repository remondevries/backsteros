"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CalendarApi,
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

import type { MeetingWeekdayHoursEntry } from "@backsteros/contracts";

import {
  CALENDAR_AVAILABILITY_VIEW_MODE_OPTIONS,
  CALENDAR_HEADER_TOOLBAR,
  calendarViewModeToFcView,
  fcViewTypeToCalendarViewMode,
  normalizeCalendarAvailabilityViewMode,
  type CalendarAvailabilityViewMode,
  type CalendarViewMode,
} from "../../calendar/calendar-view-modes.js";
import {
  AVAILABILITY_EVENT_TYPE,
  calendarChangeToWeekdayHoursPatch,
  calendarSelectionToWeekdayHoursPatch,
  getWeekdayHoursForYmd,
  weekdayHoursToCalendarEvents,
  ymdInTimeZone,
} from "../../calendar/calendar-availability-events.js";
import { patchWeekdayHoursEntry } from "../../calendar/calendar-availability-slots.js";
import { CalendarAvailabilityDayPopover } from "./calendar-availability-day-popover.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";

export type CalendarAvailabilityViewProps = {
  weekdayHours: MeetingWeekdayHoursEntry[];
  timezone: string;
  viewMode?: CalendarViewMode;
  onViewModeChange?: (mode: CalendarViewMode) => void;
  onWeekdayHoursChange: (weekdayHours: MeetingWeekdayHoursEntry[]) => void;
  onCalendarApi?: (api: CalendarApi | null) => void;
  onRangeTitleChange?: (title: string) => void;
};

function isAvailabilityEvent(event: {
  extendedProps: Record<string, unknown>;
}): boolean {
  return event.extendedProps.entityType === AVAILABILITY_EVENT_TYPE;
}

export function CalendarAvailabilityView({
  weekdayHours,
  timezone,
  viewMode: controlledViewMode,
  onViewModeChange,
  onWeekdayHoursChange,
  onCalendarApi,
  onRangeTitleChange,
}: CalendarAvailabilityViewProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    useState<CalendarViewMode>("week");
  const viewMode = controlledViewMode ?? uncontrolledViewMode;
  const availabilityViewMode = normalizeCalendarAvailabilityViewMode(viewMode);
  const isControlled = controlledViewMode !== undefined;
  const [visibleRange, setVisibleRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [openDayPopover, setOpenDayPopover] = useState<{
    weekday: number;
    ymd: string;
    anchorRect: DOMRect;
  } | null>(null);

  const fixedMirrorParent =
    typeof document !== "undefined" ? document.body : undefined;

  const events = useMemo(() => {
    if (!visibleRange) return [];
    return weekdayHoursToCalendarEvents({
      weekdayHours,
      timezone,
      rangeStart: visibleRange.start,
      rangeEnd: visibleRange.end,
      editable: availabilityViewMode !== "month",
      presentation: availabilityViewMode === "month" ? "month" : "timed",
    });
  }, [weekdayHours, timezone, visibleRange, availabilityViewMode]);

  const openPopoverForDay = useCallback(
    (ymd: string, anchorEl: HTMLElement) => {
      const entry = getWeekdayHoursForYmd(weekdayHours, ymd, timezone);
      if (!entry?.enabled) return;
      setOpenDayPopover({
        weekday: entry.weekday,
        ymd,
        anchorRect: anchorEl.getBoundingClientRect(),
      });
    },
    [timezone, weekdayHours],
  );

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    // Skip the redundant `updateSize()` when a keep-alive pane collapses to 0×0
    // (content-visibility hidden) and returns to the same size on reveal; only
    // resize on a real, non-zero size change.
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

  useEffect(() => () => onCalendarApi?.(null), [onCalendarApi]);

  const handleCalendarInstanceRef = useCallback(
    (instance: { getApi: () => CalendarApi } | null) => {
      const api = instance?.getApi() ?? null;
      calendarApiRef.current = api;
      onCalendarApi?.(api);
    },
    [onCalendarApi],
  );

  useEffect(() => {
    const api = calendarApiRef.current;
    if (!api) return;
    const fcView = calendarViewModeToFcView(availabilityViewMode);
    if (api.view.type !== fcView) {
      api.changeView(fcView);
    }
  }, [availabilityViewMode]);

  const updateViewMode = useCallback(
    (mode: CalendarViewMode) => {
      if (!isControlled) {
        setUncontrolledViewMode(mode);
      }
      onViewModeChange?.(mode);
    },
    [isControlled, onViewModeChange],
  );

  useEffect(() => {
    if (viewMode !== availabilityViewMode) {
      updateViewMode(availabilityViewMode);
    }
  }, [availabilityViewMode, viewMode, updateViewMode]);

  const handleDatesSet = (info: DatesSetArg) => {
    setOpenDayPopover(null);
    onRangeTitleChange?.(info.view.title);
    const mode = normalizeCalendarAvailabilityViewMode(
      fcViewTypeToCalendarViewMode(info.view.type),
    );
    if (mode !== availabilityViewMode) {
      updateViewMode(mode);
    }
    setVisibleRange({ start: info.start, end: info.end });
  };

  const handleViewModeChange = (mode: CalendarAvailabilityViewMode) => {
    const api = calendarApiRef.current;
    if (!api) return;
    setOpenDayPopover(null);
    api.changeView(calendarViewModeToFcView(mode));
    updateViewMode(mode);
  };

  const applyAvailabilityChange = (
    event: EventDropArg["event"] | EventResizeDoneArg["event"],
    revert: () => void,
  ) => {
    if (!isAvailabilityEvent(event)) {
      revert();
      return;
    }
    const weekday = Number(event.extendedProps.weekday);
    const slotIndex = Number(event.extendedProps.slotIndex ?? 0);
    const patched = calendarChangeToWeekdayHoursPatch({
      weekday,
      slotIndex,
      start: event.start,
      end: event.end,
      timezone,
      weekdayHours,
    });
    if (!patched) {
      revert();
      return;
    }
    onWeekdayHoursChange(patched);
  };

  const handleEventDrop = (info: EventDropArg) => {
    applyAvailabilityChange(info.event, () => info.revert());
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    applyAvailabilityChange(info.event, () => info.revert());
  };

  const handleDateSelect = (info: DateSelectArg) => {
    if (availabilityViewMode === "month") {
      info.view.calendar.unselect();
      return;
    }
    const patched = calendarSelectionToWeekdayHoursPatch({
      start: info.start,
      end: info.end,
      timezone,
      weekdayHours,
    });
    if (patched) {
      onWeekdayHoursChange(patched);
    }
    info.view.calendar.unselect();
  };

  const handleEventClick = (info: EventClickArg) => {
    if (availabilityViewMode !== "month") return;
    if (!isAvailabilityEvent(info.event)) return;
    info.jsEvent.preventDefault();
    info.jsEvent.stopPropagation();
    const ymd = String(info.event.extendedProps.ymd ?? "");
    if (!ymd) return;
    openPopoverForDay(ymd, info.el);
  };

  const handleDateClick = (info: DateClickArg) => {
    if (availabilityViewMode !== "month") return;
    const ymd = ymdInTimeZone(info.date, timezone);
    const anchorEl =
      (info.dayEl.querySelector(".fc-daygrid-day-events") as HTMLElement | null) ??
      info.dayEl;
    openPopoverForDay(ymd, anchorEl);
  };

  const selectedWeekdayEntry = useMemo(() => {
    if (!openDayPopover) return null;
    return (
      weekdayHours.find((entry) => entry.weekday === openDayPopover.weekday) ??
      null
    );
  }, [openDayPopover, weekdayHours]);

  return (
    <div
      className="calendar-view calendar-availability-view"
      data-calendar-view
      data-calendar-availability-view
    >
      <div className="calendar-view-main" ref={mainRef}>
        <FullCalendar
          ref={handleCalendarInstanceRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          initialView={calendarViewModeToFcView(availabilityViewMode)}
          headerToolbar={CALENDAR_HEADER_TOOLBAR}
          height="100%"
          expandRows
          firstDay={1}
          nowIndicator
          dayMaxEventRows={availabilityViewMode !== "month"}
          dayMaxEvents={availabilityViewMode === "month" ? false : undefined}
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          fixedMirrorParent={fixedMirrorParent}
          editable
          selectable={availabilityViewMode !== "month"}
          selectMirror
          eventStartEditable
          eventDurationEditable
          eventResizableFromStart
          events={events}
          datesSet={handleDatesSet}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          select={handleDateSelect}
          dayCellClassNames={(arg) => {
            if (availabilityViewMode !== "month") return [];
            const ymd = ymdInTimeZone(arg.date, timezone);
            const entry = getWeekdayHoursForYmd(weekdayHours, ymd, timezone);
            return entry?.enabled ? ["fc-day-has-availability"] : [];
          }}
          eventClassNames={() => ["calendar-availability-event"]}
        />
        <FloatingPillToggleDock className="calendar-view-mode-dock">
          <SegmentedPillToggle
            value={availabilityViewMode}
            options={CALENDAR_AVAILABILITY_VIEW_MODE_OPTIONS}
            onChange={handleViewModeChange}
            ariaLabel="Calendar view mode"
          />
        </FloatingPillToggleDock>
      </div>
      <CalendarAvailabilityDayPopover
        open={openDayPopover != null}
        anchorRect={openDayPopover?.anchorRect ?? null}
        entry={selectedWeekdayEntry}
        ymd={openDayPopover?.ymd ?? null}
        onClose={() => setOpenDayPopover(null)}
        onSave={(slots) => {
          if (!openDayPopover) return;
          onWeekdayHoursChange(
            patchWeekdayHoursEntry(weekdayHours, openDayPopover.weekday, {
              slots,
            }),
          );
        }}
        onRemove={() => {
          if (!openDayPopover) return;
          onWeekdayHoursChange(
            patchWeekdayHoursEntry(weekdayHours, openDayPopover.weekday, {
              enabled: false,
            }),
          );
        }}
      />
    </div>
  );
}
