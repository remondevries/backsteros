"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import type {
  MeetingWeekdayHoursEntry,
} from "@backsteros/contracts";

import type {
  CalendarApi,
  DateSelectArg,
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
  CALENDAR_HEADER_TOOLBAR,
  CALENDAR_VIEW_MODE_OPTIONS,
  calendarViewModeToFcView,
  fcViewTypeToCalendarViewMode,
  type CalendarViewMode,
} from "../../calendar/calendar-view-modes.js";
import {
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
  calendarEntityFromEvent,
  calendarSelectionToMeetingRange,
  type MeetingCalendarPatch,
  type TaskCalendarEvent,
  type TaskCalendarPatch,
} from "../../calendar/calendar-events.js";
import {
  isMeetingsAvailabilityGridView,
  MEETINGS_AVAILABILITY_MARKER_TYPE,
  weekdayHoursToMeetingAvailabilityMarkers,
} from "../../calendar/calendar-availability-events.js";
import {
  CalendarMeetingEventPopover,
  type CalendarMeetingPopoverMeeting,
} from "./calendar-meeting-event-popover.js";
import {
  CalendarTaskEventPopover,
  type CalendarTaskPopoverTask,
} from "./calendar-task-event-popover.js";
import { renderCalendarTaskEventContent } from "./calendar-task-event-content.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { CalendarHabitIconItem } from "./calendar-habits-icon-row.js";
import { useCalendarDayHabitMounts } from "./use-calendar-day-habit-mounts.js";
import { useCalendarGridKeyboardNavigation } from "../../calendar/use-calendar-grid-keyboard-navigation.js";
import { CALENDAR_GRID_KEYBOARD_ITEM_ATTR } from "../../calendar/calendar-grid-keyboard.js";
import { useListDismissDetailShortcut } from "../../list-nav/use-list-clear-selection-shortcut.js";

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
  /**
   * Drag-select on week/day time grid → create a Triage meeting for that range.
   */
  onCreateMeetingFromSelect?: (range: {
    startAt: string;
    endAt: string;
  }) => void | Promise<void>;
  /** When set, clicking a calendar task opens an anchored detail popover. */
  resolveTask?: (taskId: string) => CalendarTaskPopoverTask | null | undefined;
  /** Fires when the task popover opens/closes so the host can load description from SQLite. */
  onTaskPopoverChange?: (taskId: string | null) => void;
  /** When set, clicking a calendar meeting opens an anchored detail popover. */
  resolveMeeting?: (
    meetingId: string,
  ) => CalendarMeetingPopoverMeeting | null | undefined;
  onTaskOpen?: (taskId: string) => void;
  /** Opens the meeting detail overlay (narrow panel by default). */
  onMeetingOpen?: (meetingId: string) => void;
  /** Habit day tasks keyed by local `YYYY-MM-DD` (shown above each day's events). */
  dayHabitsByDate?: ReadonlyMap<string, readonly CalendarHabitIconItem[]>;
  onToggleDayHabit?: (
    item: CalendarHabitIconItem,
    completed: boolean,
  ) => void;
  viewMode?: CalendarViewMode;
  onViewModeChange?: (mode: CalendarViewMode) => void;
  /** Booking availability windows (thin markers in week/day time grid). */
  bookingAvailability?: {
    weekdayHours: MeetingWeekdayHoursEntry[];
    timezone: string;
  };
  onCalendarApi?: (api: CalendarApi | null) => void;
  onRangeTitleChange?: (title: string) => void;
  selectedGridEventId?: string | null;
  keyboardNavigationEnabled?: boolean;
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
  onCreateMeetingFromSelect,
  resolveTask,
  onTaskPopoverChange,
  resolveMeeting,
  onTaskOpen,
  onMeetingOpen,
  dayHabitsByDate,
  onToggleDayHabit,
  viewMode: controlledViewMode,
  onViewModeChange,
  bookingAvailability,
  onCalendarApi,
  onRangeTitleChange,
  selectedGridEventId = null,
  keyboardNavigationEnabled = true,
}: CalendarViewProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    useState<CalendarViewMode>("week");
  const viewMode = controlledViewMode ?? uncontrolledViewMode;
  const isControlled = controlledViewMode !== undefined;
  const [openTaskPopover, setOpenTaskPopover] =
    useState<OpenTaskPopoverState | null>(null);
  const [openMeetingPopover, setOpenMeetingPopover] =
    useState<OpenMeetingPopoverState | null>(null);
  const [visibleRange, setVisibleRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [activeGridView, setActiveGridView] = useState<string | null>(null);
  const fixedMirrorParent =
    typeof document !== "undefined" ? document.body : undefined;

  const {
    dayCellDidMount,
    dayCellWillUnmount,
    dayHeaderDidMount,
    dayHeaderWillUnmount,
    syncListDayHabits,
  } = useCalendarDayHabitMounts(dayHabitsByDate ?? new Map(), onToggleDayHabit);

  const availabilityMarkers = useMemo(() => {
    if (!bookingAvailability || !visibleRange || !activeGridView) return [];
    if (!isMeetingsAvailabilityGridView(activeGridView)) return [];
    return weekdayHoursToMeetingAvailabilityMarkers({
      weekdayHours: bookingAvailability.weekdayHours,
      timezone: bookingAvailability.timezone,
      rangeStart: visibleRange.start,
      rangeEnd: visibleRange.end,
    });
  }, [activeGridView, bookingAvailability, visibleRange]);

  const calendarEvents = useMemo(
    () => [...availabilityMarkers, ...events],
    [availabilityMarkers, events],
  );

  const closePopovers = useCallback(() => {
    setOpenTaskPopover(null);
    setOpenMeetingPopover(null);
  }, []);

  useEffect(() => {
    onTaskPopoverChange?.(openTaskPopover?.task.id ?? null);
  }, [onTaskPopoverChange, openTaskPopover?.task.id]);

  const calendarEntityPopoverOpen =
    openTaskPopover != null || openMeetingPopover != null;

  useListDismissDetailShortcut({
    enabled: calendarEntityPopoverOpen,
    onDismiss: closePopovers,
  });

  const openCalendarEvent = useCallback(
    (eventId: string, anchorRect: DOMRect) => {
      const event = events.find((entry) => entry.id === eventId);
      if (!event) return;

      const habitId =
        event.extendedProps.entityType === "task"
          ? event.extendedProps.habitId
          : null;
      if (typeof habitId === "string" && habitId.trim()) {
        return;
      }

      const entity = calendarEntityFromEvent({
        id: event.id,
        extendedProps: event.extendedProps,
      });

      if (entity.entityType === "meeting") {
        if (resolveMeeting) {
          const meeting = resolveMeeting(entity.entityId);
          if (meeting) {
            closePopovers();
            setOpenMeetingPopover({ meeting, anchorRect });
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
          setOpenTaskPopover({ task, anchorRect });
          return;
        }
      }
      onTaskOpen?.(entity.entityId);
    },
    [
      closePopovers,
      events,
      onMeetingOpen,
      onTaskOpen,
      resolveMeeting,
      resolveTask,
    ],
  );

  const handleKeyboardActivateEvent = useCallback(
    (eventId: string) => {
      const event = events.find((entry) => entry.id === eventId);
      if (!event) return;

      const entity = calendarEntityFromEvent({
        id: event.id,
        extendedProps: event.extendedProps,
      });

      if (entity.entityType === "meeting") {
        if (
          openMeetingPopover?.meeting.id === entity.entityId &&
          onMeetingOpen
        ) {
          closePopovers();
          onMeetingOpen(entity.entityId);
          return;
        }
      } else if (openTaskPopover?.task.id === entity.entityId && onTaskOpen) {
        closePopovers();
        onTaskOpen(entity.entityId);
        return;
      }

      const container = mainRef.current;
      const anchorEl =
        container?.querySelector<HTMLElement>(
          `[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}="${CSS.escape(eventId)}"]`,
        ) ??
        document.body.querySelector<HTMLElement>(
          `[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}="${CSS.escape(eventId)}"]`,
        );
      openCalendarEvent(eventId, anchorEl?.getBoundingClientRect() ?? new DOMRect());
    },
    [
      closePopovers,
      events,
      onMeetingOpen,
      onTaskOpen,
      openCalendarEvent,
      openMeetingPopover,
      openTaskPopover,
    ],
  );

  const {
    listContainerProps: gridListContainerProps,
    handleEventDidMount,
    handleEventWillUnmount,
  } = useCalendarGridKeyboardNavigation({
    containerRef: mainRef,
    events,
    visibleRange,
    viewMode,
    selectedEventId: selectedGridEventId,
    enabled: keyboardNavigationEnabled && !calendarEntityPopoverOpen,
    onActivateEvent: handleKeyboardActivateEvent,
  });

  useEffect(() => {
    if (viewMode !== "list") return;
    syncListDayHabits(mainRef.current);
  }, [viewMode, dayHabitsByDate, syncListDayHabits]);

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    // Keep-alive panes toggle `content-visibility: hidden`, collapsing this
    // container to 0×0 and back to the same size on reveal. Skip the redundant
    // `updateSize()` on that round-trip so re-entering the calendar just
    // repaints the preserved grid; only resize on a real size change.
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
    const fcView = calendarViewModeToFcView(viewMode);
    if (api.view.type !== fcView) {
      api.changeView(fcView);
    }
  }, [viewMode]);

  const updateViewMode = (mode: CalendarViewMode) => {
    if (!isControlled) {
      setUncontrolledViewMode(mode);
    }
    onViewModeChange?.(mode);
  };

  const handleDatesSet = (info: DatesSetArg) => {
    setVisibleRange({ start: info.start, end: info.end });
    setActiveGridView(info.view.type);
    onRangeTitleChange?.(info.view.title);
    const mode = fcViewTypeToCalendarViewMode(info.view.type);
    if (mode !== viewMode) {
      updateViewMode(mode);
    }
    closePopovers();
    if (info.view.type === "listWeek") {
      requestAnimationFrame(() => syncListDayHabits(mainRef.current));
    }
  };

  const handleViewModeChange = (mode: CalendarViewMode) => {
    const api = calendarApiRef.current;
    if (!api) return;
    api.changeView(calendarViewModeToFcView(mode));
    updateViewMode(mode);
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

  const selectEnabled =
    Boolean(onCreateMeetingFromSelect) &&
    (viewMode === "week" || viewMode === "day");

  const handleDateSelect = (info: DateSelectArg) => {
    if (!onCreateMeetingFromSelect) {
      info.view.calendar.unselect();
      return;
    }
    const range = calendarSelectionToMeetingRange({
      start: info.start,
      end: info.end,
      allDay: info.allDay,
    });
    info.view.calendar.unselect();
    if (!range) return;
    closePopovers();
    void Promise.resolve(onCreateMeetingFromSelect(range));
  };

  const handleEventClick = (info: EventClickArg) => {
    if (
      info.event.extendedProps.entityType === MEETINGS_AVAILABILITY_MARKER_TYPE ||
      info.event.display === "background"
    ) {
      return;
    }
    // Habit blocks are not meeting/task detail surfaces — no popover / overlay.
    const habitId = info.event.extendedProps.habitId;
    if (typeof habitId === "string" && habitId.trim()) {
      return;
    }
    info.jsEvent.preventDefault();
    openCalendarEvent(info.event.id, info.el.getBoundingClientRect());
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
      <div
        className="calendar-view-main"
        ref={mainRef}
        {...gridListContainerProps}
      >
        <FullCalendar
          ref={handleCalendarInstanceRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          initialView={calendarViewModeToFcView(viewMode)}
          headerToolbar={CALENDAR_HEADER_TOOLBAR}
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
          selectable={selectEnabled}
          selectMirror={selectEnabled}
          select={selectEnabled ? handleDateSelect : undefined}
          events={calendarEvents}
          datesSet={handleDatesSet}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventReceive={handleEventReceive}
          eventClick={handleEventClick}
          eventContent={renderCalendarTaskEventContent}
          eventDidMount={handleEventDidMount}
          eventWillUnmount={handleEventWillUnmount}
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
