"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";

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
  type EventDragStartArg,
  type EventDragStopArg,
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

import {
  CALENDAR_HEADER_TOOLBAR,
  CALENDAR_VIEW_MODE_OPTIONS,
  DEFAULT_CALENDAR_VIEW_MODE,
  calendarViewModeToFcView,
  fcViewTypeToCalendarViewMode,
  type CalendarViewMode,
} from "../../calendar/calendar-view-modes.js";
import {
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
  calendarEntityFromEvent,
  calendarSelectionToMeetingRange,
  isCalendarMeetingDuplicateModifier,
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
  CalendarBirthdayEventPopover,
  type CalendarBirthdayPopoverContact,
} from "./calendar-birthday-event-popover.js";
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
import {
  addDaysDate,
  calendarWeekStripDates,
  CALENDAR_WEEK_STRIP_CENTER_INDEX,
  CALENDAR_WEEK_STRIP_PANE_COUNT,
  formatLocalYmd,
  parseLocalYmd,
  startOfWeekMondayDate,
} from "../../calendar/calendar-week-strip.js";
import {
  addMonthsDate,
  calendarMonthStripDates,
  CALENDAR_MONTH_STRIP_CENTER_INDEX,
  CALENDAR_MONTH_STRIP_PANE_COUNT,
  CALENDAR_MONTH_STRIP_WEEKDAY_LABELS,
  formatLocalYm,
  formatMonthAnchorYmd,
  parseMonthAnchorYmd,
  startOfMonthDate,
} from "../../calendar/calendar-month-strip.js";
import {
  calendarDayStripDates,
  CALENDAR_DAY_STRIP_CENTER_INDEX,
  CALENDAR_DAY_STRIP_PANE_COUNT,
  formatCalendarDayStripHeaderLabel,
  formatDayAnchorYmd,
  parseDayAnchorYmd,
} from "../../calendar/calendar-day-strip.js";
import { calendarStripCenterScrollOffset } from "../../calendar/calendar-strip-geometry.js";
import { filterCalendarEventsOverlappingRange } from "../../calendar/calendar-strip-events.js";
import { syncCalendarWeekStripAllDayHeights } from "../../calendar/calendar-week-strip-layout.js";
import { useCalendarWeekStripScroll } from "../../calendar/use-calendar-week-strip-scroll.js";
import { useCalendarWeekStripAxisRail } from "../../calendar/use-calendar-week-strip-axis-rail.js";
import { useCalendarMonthStripScroll } from "../../calendar/use-calendar-month-strip-scroll.js";
import { useCalendarDayStripScroll } from "../../calendar/use-calendar-day-strip-scroll.js";
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
   * Alt/Option + drag-drop a meeting → create a copy at the new slot.
   * Copy only when Alt is held at drop (releasing mid-drag moves instead).
   */
  onMeetingDuplicate?: (
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
  /** When set, clicking a birthday marker opens an anchored contact popover. */
  resolveBirthdayContact?: (
    contactId: string,
  ) => CalendarBirthdayPopoverContact | null | undefined;
  onTaskOpen?: (taskId: string) => void;
  /** Opens the contact profile for a birthday marker (View profile / fallback). */
  onBirthdayOpen?: (contactId: string) => void;
  onBirthdayAddNote?: (contactId: string) => void;
  onBirthdayAddTask?: (contactId: string) => void;
  onBirthdayAddMeeting?: (contactId: string) => void;
  onBirthdaySendEmail?: (contactId: string) => void;
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

export function CalendarView({
  events,
  onTaskReschedule,
  onMeetingReschedule,
  onMeetingDuplicate,
  onCreateMeetingFromSelect,
  resolveTask,
  onTaskPopoverChange,
  resolveBirthdayContact,
  onTaskOpen,
  onBirthdayOpen,
  onBirthdayAddNote,
  onBirthdayAddTask,
  onBirthdayAddMeeting,
  onBirthdaySendEmail,
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
  const weekStripRef = useRef<HTMLDivElement>(null);
  const monthStripRef = useRef<HTMLDivElement>(null);
  const dayStripRef = useRef<HTMLDivElement>(null);
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const meetingDragCopyCleanupRef = useRef<(() => void) | null>(null);
  const weekApisRef = useRef<(CalendarApi | null)[]>(
    Array.from({ length: CALENDAR_WEEK_STRIP_PANE_COUNT }, () => null),
  );
  const monthApisRef = useRef<(CalendarApi | null)[]>(
    Array.from({ length: CALENDAR_MONTH_STRIP_PANE_COUNT }, () => null),
  );
  const dayApisRef = useRef<(CalendarApi | null)[]>(
    Array.from({ length: CALENDAR_DAY_STRIP_PANE_COUNT }, () => null),
  );
  const wasWeekStripRef = useRef(false);
  const wasMonthStripRef = useRef(false);
  const wasDayStripRef = useRef(false);
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    useState<CalendarViewMode>(DEFAULT_CALENDAR_VIEW_MODE);
  const viewMode = controlledViewMode ?? uncontrolledViewMode;
  const isControlled = controlledViewMode !== undefined;
  const isWeekStrip = viewMode === "week";
  const isMonthStrip = viewMode === "month";
  const isDayStrip = viewMode === "day";
  const [weekAnchorYmd, setWeekAnchorYmd] = useState(() =>
    formatLocalYmd(startOfWeekMondayDate(new Date())),
  );
  const [monthAnchorYmd, setMonthAnchorYmd] = useState(() =>
    formatMonthAnchorYmd(new Date()),
  );
  const [dayAnchorYmd, setDayAnchorYmd] = useState(() =>
    formatDayAnchorYmd(new Date()),
  );
  const [openTaskPopover, setOpenTaskPopover] =
    useState<OpenTaskPopoverState | null>(null);
  const [openBirthdayPopover, setOpenBirthdayPopover] = useState<{
    contact: CalendarBirthdayPopoverContact;
    occurrenceDate: string | null;
    anchorRect: DOMRect;
  } | null>(null);
  const [visibleRange, setVisibleRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [activeGridView, setActiveGridView] = useState<string | null>(null);
  const fixedMirrorParent =
    typeof document !== "undefined" ? document.body : undefined;

  const weekStripDates = useMemo(
    () => calendarWeekStripDates(parseLocalYmd(weekAnchorYmd)),
    [weekAnchorYmd],
  );
  const weekStripDatesRef = useRef(weekStripDates);
  weekStripDatesRef.current = weekStripDates;

  const shiftWeekAnchor = useCallback((weeks: number) => {
    if (weeks === 0) return;
    setWeekAnchorYmd((current) =>
      formatLocalYmd(addDaysDate(parseLocalYmd(current), weeks * 7)),
    );
  }, []);

  const syncWeekStripDates = useCallback(() => {
    const targets = weekStripDatesRef.current;
    const apis = weekApisRef.current;
    for (let i = 0; i < targets.length; i += 1) {
      const api = apis[i];
      const target = targets[i];
      if (!api || !target) continue;
      const onWeek =
        formatLocalYmd(startOfWeekMondayDate(api.getDate())) ===
        formatLocalYmd(target);
      if (!onWeek) {
        api.gotoDate(target);
      }
    }
    const strip = weekStripRef.current;
    if (strip) {
      syncCalendarWeekStripAllDayHeights(strip);
    }
  }, []);

  useCalendarWeekStripScroll({
    stripRef: weekStripRef,
    enabled: isWeekStrip,
    onShiftWeeks: shiftWeekAnchor,
  });

  const { railRef: weekAxisRailRef, hourLabels: weekAxisHourLabels } =
    useCalendarWeekStripAxisRail({
      stripRef: weekStripRef,
      enabled: isWeekStrip,
      anchorKey: weekAnchorYmd,
    });

  useEffect(() => {
    const enteringWeek = isWeekStrip && !wasWeekStripRef.current;
    wasWeekStripRef.current = isWeekStrip;
    if (!enteringWeek) return;
    const middleApi = weekApisRef.current[CALENDAR_WEEK_STRIP_CENTER_INDEX];
    const base =
      calendarApiRef.current?.getDate?.() ??
      middleApi?.getDate?.() ??
      new Date();
    setWeekAnchorYmd(formatLocalYmd(startOfWeekMondayDate(base)));
  }, [isWeekStrip]);

  useEffect(() => {
    return () => {
      meetingDragCopyCleanupRef.current?.();
      meetingDragCopyCleanupRef.current = null;
      document.body.classList.remove("calendar-event-drag-copy");
    };
  }, []);

  // FullCalendar's gotoDate uses flushSync. Queue it outside React's layout
  // lifecycle while keeping it in the same frame, before the next paint.
  useLayoutEffect(() => {
    if (!isWeekStrip) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      syncWeekStripDates();
      const strip = weekStripRef.current;
      if (strip && strip.clientWidth > 0) {
        strip.scrollLeft = calendarStripCenterScrollOffset(
          strip.clientWidth,
          CALENDAR_WEEK_STRIP_PANE_COUNT,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isWeekStrip, syncWeekStripDates, weekAnchorYmd]);

  const monthStripDates = useMemo(
    () => calendarMonthStripDates(parseMonthAnchorYmd(monthAnchorYmd)),
    [monthAnchorYmd],
  );
  const monthStripDatesRef = useRef(monthStripDates);
  monthStripDatesRef.current = monthStripDates;

  const shiftMonthAnchor = useCallback((months: number) => {
    if (months === 0) return;
    setMonthAnchorYmd((current) =>
      formatMonthAnchorYmd(
        addMonthsDate(parseMonthAnchorYmd(current), months),
      ),
    );
  }, []);

  const syncMonthStripDates = useCallback(() => {
    const targets = monthStripDatesRef.current;
    const apis = monthApisRef.current;
    for (let i = 0; i < targets.length; i += 1) {
      const api = apis[i];
      const target = targets[i];
      if (!api || !target) continue;
      const onMonth =
        formatLocalYm(startOfMonthDate(api.getDate())) ===
        formatLocalYm(target);
      if (!onMonth) {
        api.gotoDate(target);
      }
    }
  }, []);

  useCalendarMonthStripScroll({
    stripRef: monthStripRef,
    enabled: isMonthStrip,
    onShiftMonths: shiftMonthAnchor,
  });

  useEffect(() => {
    const enteringMonth = isMonthStrip && !wasMonthStripRef.current;
    wasMonthStripRef.current = isMonthStrip;
    if (!enteringMonth) return;
    const middleApi = monthApisRef.current[CALENDAR_MONTH_STRIP_CENTER_INDEX];
    const base =
      calendarApiRef.current?.getDate?.() ??
      middleApi?.getDate?.() ??
      new Date();
    setMonthAnchorYmd(formatMonthAnchorYmd(base));
  }, [isMonthStrip]);

  useLayoutEffect(() => {
    if (!isMonthStrip) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      syncMonthStripDates();
      const strip = monthStripRef.current;
      if (strip && strip.clientHeight > 0) {
        strip.scrollTop = calendarStripCenterScrollOffset(
          strip.clientHeight,
          CALENDAR_MONTH_STRIP_PANE_COUNT,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isMonthStrip, syncMonthStripDates, monthAnchorYmd]);

  const publishWeekStripApi = useCallback(
    (middleApi: CalendarApi | null) => {
      weekApisRef.current[CALENDAR_WEEK_STRIP_CENTER_INDEX] = middleApi;
      if (!middleApi) {
        calendarApiRef.current = null;
        onCalendarApi?.(null);
        return;
      }

      const proxy = {
        prev: () => shiftWeekAnchor(-1),
        next: () => shiftWeekAnchor(1),
        today: () => {
          setWeekAnchorYmd(
            formatLocalYmd(startOfWeekMondayDate(new Date())),
          );
        },
        gotoDate: (dateInput: Date | string) => {
          const date =
            typeof dateInput === "string" ? new Date(dateInput) : dateInput;
          setWeekAnchorYmd(formatLocalYmd(startOfWeekMondayDate(date)));
        },
        incrementDate: (delta: {
          days?: number;
          weeks?: number;
          months?: number;
          years?: number;
        }) => {
          const days =
            (delta.days ?? 0) +
            (delta.weeks ?? 0) * 7 +
            (delta.months ?? 0) * 30 +
            (delta.years ?? 0) * 365;
          if (!days) return;
          setWeekAnchorYmd((current) =>
            formatLocalYmd(
              startOfWeekMondayDate(
                addDaysDate(parseLocalYmd(current), days),
              ),
            ),
          );
        },
        changeView: (viewName: string, dateOrRange?: unknown) => {
          middleApi.changeView(viewName, dateOrRange as never);
        },
        updateSize: () => {
          for (const api of weekApisRef.current) {
            api?.updateSize();
          }
        },
        getDate: () => middleApi.getDate(),
        get view() {
          return middleApi.view;
        },
      } as CalendarApi;

      calendarApiRef.current = proxy;
      onCalendarApi?.(proxy);
    },
    [onCalendarApi, shiftWeekAnchor],
  );

  const publishMonthStripApi = useCallback(
    (middleApi: CalendarApi | null) => {
      monthApisRef.current[CALENDAR_MONTH_STRIP_CENTER_INDEX] = middleApi;
      if (!middleApi) {
        calendarApiRef.current = null;
        onCalendarApi?.(null);
        return;
      }

      const proxy = {
        prev: () => shiftMonthAnchor(-1),
        next: () => shiftMonthAnchor(1),
        today: () => {
          setMonthAnchorYmd(formatMonthAnchorYmd(new Date()));
        },
        gotoDate: (dateInput: Date | string) => {
          const date =
            typeof dateInput === "string" ? new Date(dateInput) : dateInput;
          setMonthAnchorYmd(formatMonthAnchorYmd(date));
        },
        incrementDate: (delta: {
          days?: number;
          weeks?: number;
          months?: number;
          years?: number;
        }) => {
          const months =
            (delta.months ?? 0) + (delta.years ?? 0) * 12;
          if (months) {
            setMonthAnchorYmd((current) =>
              formatMonthAnchorYmd(
                addMonthsDate(parseMonthAnchorYmd(current), months),
              ),
            );
            return;
          }
          const days =
            (delta.days ?? 0) + (delta.weeks ?? 0) * 7;
          if (!days) return;
          setMonthAnchorYmd((current) =>
            formatMonthAnchorYmd(
              addDaysDate(parseMonthAnchorYmd(current), days),
            ),
          );
        },
        changeView: (viewName: string, dateOrRange?: unknown) => {
          middleApi.changeView(viewName, dateOrRange as never);
        },
        updateSize: () => {
          for (const api of monthApisRef.current) {
            api?.updateSize();
          }
        },
        getDate: () => middleApi.getDate(),
        get view() {
          return middleApi.view;
        },
      } as CalendarApi;

      calendarApiRef.current = proxy;
      onCalendarApi?.(proxy);
    },
    [onCalendarApi, shiftMonthAnchor],
  );

  const dayStripDates = useMemo(
    () => calendarDayStripDates(parseDayAnchorYmd(dayAnchorYmd)),
    [dayAnchorYmd],
  );
  const dayStripDatesRef = useRef(dayStripDates);
  dayStripDatesRef.current = dayStripDates;

  const shiftDayAnchor = useCallback((days: number) => {
    if (days === 0) return;
    setDayAnchorYmd((current) =>
      formatDayAnchorYmd(addDaysDate(parseDayAnchorYmd(current), days)),
    );
  }, []);

  const syncDayStripDates = useCallback(() => {
    const targets = dayStripDatesRef.current;
    const apis = dayApisRef.current;
    for (let i = 0; i < targets.length; i += 1) {
      const api = apis[i];
      const target = targets[i];
      if (!api || !target) continue;
      const onDay =
        formatDayAnchorYmd(api.getDate()) === formatLocalYmd(target);
      if (!onDay) {
        api.gotoDate(target);
      }
    }
    const strip = dayStripRef.current;
    if (strip) {
      syncCalendarWeekStripAllDayHeights(strip, "data-day-pane");
    }
  }, []);

  useCalendarDayStripScroll({
    stripRef: dayStripRef,
    enabled: isDayStrip,
    onShiftDays: shiftDayAnchor,
  });

  const { railRef: dayAxisRailRef, hourLabels: dayAxisHourLabels } =
    useCalendarWeekStripAxisRail({
      stripRef: dayStripRef,
      enabled: isDayStrip,
      anchorKey: dayAnchorYmd,
      variant: "day",
    });

  useEffect(() => {
    const enteringDay = isDayStrip && !wasDayStripRef.current;
    wasDayStripRef.current = isDayStrip;
    if (!enteringDay) return;
    const middleApi = dayApisRef.current[CALENDAR_DAY_STRIP_CENTER_INDEX];
    const base =
      calendarApiRef.current?.getDate?.() ??
      middleApi?.getDate?.() ??
      new Date();
    setDayAnchorYmd(formatDayAnchorYmd(base));
  }, [isDayStrip]);

  useLayoutEffect(() => {
    if (!isDayStrip) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      syncDayStripDates();
      const strip = dayStripRef.current;
      if (strip && strip.clientHeight > 0) {
        strip.scrollTop = calendarStripCenterScrollOffset(
          strip.clientHeight,
          CALENDAR_DAY_STRIP_PANE_COUNT,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isDayStrip, syncDayStripDates, dayAnchorYmd]);

  const publishDayStripApi = useCallback(
    (middleApi: CalendarApi | null) => {
      dayApisRef.current[CALENDAR_DAY_STRIP_CENTER_INDEX] = middleApi;
      if (!middleApi) {
        calendarApiRef.current = null;
        onCalendarApi?.(null);
        return;
      }

      const proxy = {
        prev: () => shiftDayAnchor(-1),
        next: () => shiftDayAnchor(1),
        today: () => {
          setDayAnchorYmd(formatDayAnchorYmd(new Date()));
        },
        gotoDate: (dateInput: Date | string) => {
          const date =
            typeof dateInput === "string" ? new Date(dateInput) : dateInput;
          setDayAnchorYmd(formatDayAnchorYmd(date));
        },
        incrementDate: (delta: {
          days?: number;
          weeks?: number;
          months?: number;
          years?: number;
        }) => {
          const days =
            (delta.days ?? 0) +
            (delta.weeks ?? 0) * 7 +
            (delta.months ?? 0) * 30 +
            (delta.years ?? 0) * 365;
          if (!days) return;
          setDayAnchorYmd((current) =>
            formatDayAnchorYmd(addDaysDate(parseDayAnchorYmd(current), days)),
          );
        },
        changeView: (viewName: string, dateOrRange?: unknown) => {
          middleApi.changeView(viewName, dateOrRange as never);
        },
        updateSize: () => {
          for (const api of dayApisRef.current) {
            api?.updateSize();
          }
        },
        getDate: () => middleApi.getDate(),
        get view() {
          return middleApi.view;
        },
      } as CalendarApi;

      calendarApiRef.current = proxy;
      onCalendarApi?.(proxy);
    },
    [onCalendarApi, shiftDayAnchor],
  );

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

  // Each strip pane only indexes events that can appear in its date window —
  // full workspace lists are far heavier than a single week/day/month.
  const weekPaneEvents = useMemo(
    () =>
      weekStripDates.map((weekStart) =>
        filterCalendarEventsOverlappingRange(
          calendarEvents,
          weekStart,
          addDaysDate(weekStart, 7),
        ),
      ),
    [calendarEvents, weekStripDates],
  );
  const monthPaneEvents = useMemo(
    () =>
      monthStripDates.map((monthStart) =>
        filterCalendarEventsOverlappingRange(
          calendarEvents,
          monthStart,
          addMonthsDate(monthStart, 1),
        ),
      ),
    [calendarEvents, monthStripDates],
  );
  const dayPaneEvents = useMemo(
    () =>
      dayStripDates.map((dayStart) =>
        filterCalendarEventsOverlappingRange(
          calendarEvents,
          dayStart,
          addDaysDate(dayStart, 1),
        ),
      ),
    [calendarEvents, dayStripDates],
  );

  const closePopovers = useCallback(() => {
    setOpenTaskPopover(null);
    setOpenBirthdayPopover(null);
  }, []);

  useEffect(() => {
    onTaskPopoverChange?.(openTaskPopover?.task.id ?? null);
  }, [onTaskPopoverChange, openTaskPopover?.task.id]);

  const calendarEntityPopoverOpen =
    openTaskPopover != null || openBirthdayPopover != null;

  useListDismissDetailShortcut({
    enabled: calendarEntityPopoverOpen,
    onDismiss: closePopovers,
  });

  const openCalendarEvent = useCallback(
    (
      eventLike: {
        id: string;
        start?: string | Date | null;
        extendedProps: Record<string, unknown>;
      },
      anchorRect: DOMRect,
    ) => {
      if (eventLike.extendedProps.draft === true) {
        return;
      }
      const habitId =
        eventLike.extendedProps.entityType === "task"
          ? eventLike.extendedProps.habitId
          : null;
      if (typeof habitId === "string" && habitId.trim()) {
        return;
      }

      const entity = calendarEntityFromEvent({
        id: eventLike.id,
        extendedProps: eventLike.extendedProps,
      });

      if (entity.entityType === "meeting") {
        closePopovers();
        onMeetingOpen?.(entity.entityId);
        return;
      }

      if (entity.entityType === "birthday") {
        if (openBirthdayPopover?.contact.id === entity.entityId) {
          closePopovers();
          return;
        }
        if (resolveBirthdayContact) {
          const contact = resolveBirthdayContact(entity.entityId);
          if (contact) {
            closePopovers();
            const start = eventLike.start;
            const occurrenceDate =
              typeof start === "string" && start.length >= 10
                ? start.slice(0, 10)
                : start instanceof Date && !Number.isNaN(start.getTime())
                  ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
                  : null;
            setOpenBirthdayPopover({ contact, occurrenceDate, anchorRect });
            return;
          }
        }
        onBirthdayOpen?.(entity.entityId);
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
      onBirthdayOpen,
      onMeetingOpen,
      onTaskOpen,
      openBirthdayPopover?.contact.id,
      resolveBirthdayContact,
      resolveTask,
    ],
  );

  const handleKeyboardActivateEvent = useCallback(
    (eventId: string) => {
      const event = events.find((entry) => entry.id === eventId);
      if (!event) return;
      if (
        event.extendedProps.entityType === "meeting" &&
        event.extendedProps.draft === true
      ) {
        return;
      }

      const entity = calendarEntityFromEvent({
        id: event.id,
        extendedProps: event.extendedProps,
      });

      if (entity.entityType === "meeting") {
        closePopovers();
        onMeetingOpen?.(entity.entityId);
        return;
      } else if (entity.entityType === "birthday") {
        if (
          openBirthdayPopover?.contact.id === entity.entityId &&
          onBirthdayOpen
        ) {
          closePopovers();
          onBirthdayOpen(entity.entityId);
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
      openCalendarEvent(
        {
          id: event.id,
          start: event.start,
          extendedProps: event.extendedProps,
        },
        anchorEl?.getBoundingClientRect() ?? new DOMRect(),
      );
    },
    [
      closePopovers,
      events,
      onBirthdayOpen,
      onMeetingOpen,
      onTaskOpen,
      openBirthdayPopover,
      openCalendarEvent,
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

  const handleWeekPaneInstanceRef = useCallback(
    (index: number, instance: { getApi: () => CalendarApi } | null) => {
      const api = instance?.getApi() ?? null;
      weekApisRef.current[index] = api;
      if (index === CALENDAR_WEEK_STRIP_CENTER_INDEX) {
        publishWeekStripApi(api);
      }
    },
    [publishWeekStripApi],
  );

  const handleMonthPaneInstanceRef = useCallback(
    (index: number, instance: { getApi: () => CalendarApi } | null) => {
      const api = instance?.getApi() ?? null;
      monthApisRef.current[index] = api;
      if (index === CALENDAR_MONTH_STRIP_CENTER_INDEX) {
        publishMonthStripApi(api);
      }
    },
    [publishMonthStripApi],
  );

  const handleDayPaneInstanceRef = useCallback(
    (index: number, instance: { getApi: () => CalendarApi } | null) => {
      const api = instance?.getApi() ?? null;
      dayApisRef.current[index] = api;
      if (index === CALENDAR_DAY_STRIP_CENTER_INDEX) {
        publishDayStripApi(api);
      }
    },
    [publishDayStripApi],
  );

  useEffect(() => {
    if (isWeekStrip || isMonthStrip || isDayStrip) return;
    const api = calendarApiRef.current;
    if (!api) return;
    const fcView = calendarViewModeToFcView(viewMode);
    if (api.view.type !== fcView) {
      api.changeView(fcView);
    }
  }, [isDayStrip, isMonthStrip, isWeekStrip, viewMode]);

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
    // Strip views use dedicated mounts — don't changeView on another strip's
    // FullCalendar proxy. List keeps the single-calendar path.
    if (
      mode === "week" ||
      mode === "month" ||
      mode === "day" ||
      isWeekStrip ||
      isMonthStrip ||
      isDayStrip
    ) {
      updateViewMode(mode);
      closePopovers();
      return;
    }
    const api = calendarApiRef.current;
    if (api) {
      api.changeView(calendarViewModeToFcView(mode));
    }
    updateViewMode(mode);
    closePopovers();
  };

  const applyCalendarChange = (
    event: EventDropArg["event"] | EventResizeDoneArg["event"],
    revert: () => void,
    options?: { duplicate?: boolean },
  ) => {
    const entity = calendarEntityFromEvent(event);
    if (entity.entityType === "birthday") {
      revert();
      return;
    }
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
        // Restore the source immediately; create the copy at the drop slot.
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

  const clearMeetingDragCopyAffordance = () => {
    meetingDragCopyCleanupRef.current?.();
    meetingDragCopyCleanupRef.current = null;
    document.body.classList.remove("calendar-event-drag-copy");
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
    closePopovers();
    clearMeetingDragCopyAffordance();
    applyCalendarChange(info.event, () => info.revert(), {
      duplicate: isCalendarMeetingDuplicateModifier(info.jsEvent),
    });
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    closePopovers();
    applyCalendarChange(info.event, () => info.revert());
  };

  const handleEventReceive = (info: EventReceiveArg) => {
    closePopovers();
    const entity = calendarEntityFromEvent(info.event);
    if (entity.entityType === "birthday") {
      info.revert();
      return;
    }
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
    info.jsEvent.stopPropagation();
    openCalendarEvent(
      {
        id: info.event.id,
        start: info.event.startStr || info.event.start,
        extendedProps: info.event.extendedProps as Record<string, unknown>,
      },
      info.el.getBoundingClientRect(),
    );
  };

  const popoverTask =
    openTaskPopover && resolveTask
      ? (resolveTask(openTaskPopover.task.id) ?? openTaskPopover.task)
      : openTaskPopover?.task;

  const popoverBirthdayContact =
    openBirthdayPopover && resolveBirthdayContact
      ? (resolveBirthdayContact(openBirthdayPopover.contact.id) ??
        openBirthdayPopover.contact)
      : openBirthdayPopover?.contact;

  const fcPlugins = [
    dayGridPlugin,
    timeGridPlugin,
    listPlugin,
    interactionPlugin,
  ];

  const sharedInteractionProps = {
    headerToolbar: CALENDAR_HEADER_TOOLBAR,
    height: "100%" as const,
    expandRows: true,
    firstDay: 1,
    nowIndicator: true,
    dayMaxEventRows: true,
    slotDuration: "00:30:00",
    snapDuration: "00:15:00",
    fixedMirrorParent,
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: true,
    eventResizableFromStart: true,
    eventDragMinDistance: 8,
    eventAllow: (_span: unknown, moving: { extendedProps?: Record<string, unknown> } | null) =>
      moving?.extendedProps?.entityType !== "birthday",
    droppable: true,
    selectable: selectEnabled,
    selectMirror: selectEnabled,
    select: selectEnabled ? handleDateSelect : undefined,
    eventDragStart: handleEventDragStart,
    eventDragStop: handleEventDragStop,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    eventReceive: handleEventReceive,
    eventClick: handleEventClick,
    eventContent: renderCalendarTaskEventContent,
    eventDidMount: handleEventDidMount,
    eventWillUnmount: handleEventWillUnmount,
    dayCellDidMount,
    dayCellWillUnmount,
    dayHeaderDidMount,
    dayHeaderWillUnmount,
  };

  const weekStripFcProps = {
    ...sharedInteractionProps,
    // Cap all-day rows so panes share a stable height while panning.
    dayMaxEventRows: 3,
  };

  const monthStripFcProps = {
    ...sharedInteractionProps,
    // Sticky weekday rail above the strip owns Mon–Sun labels.
    dayHeaders: false,
  };

  const dayStripFcProps = {
    ...sharedInteractionProps,
    // Sticky pane headers own the day label; keep all-day rows stable while panning.
    dayHeaders: false,
    dayMaxEventRows: 3,
  };

  return (
    <div
      className="calendar-view"
      data-calendar-view
      data-week-strip={isWeekStrip ? "true" : "false"}
      data-month-strip={isMonthStrip ? "true" : "false"}
      data-day-strip={isDayStrip ? "true" : "false"}
    >
      <div
        className="calendar-view-main"
        ref={mainRef}
        {...gridListContainerProps}
      >
        {isWeekStrip ? (
          <div className="calendar-week-strip-shell">
            <div
              ref={weekAxisRailRef}
              className="calendar-week-strip__axis-rail"
              aria-hidden="true"
            >
              <div className="calendar-week-strip__axis-top" />
              <div className="calendar-week-strip__axis-body">
                <div
                  className="calendar-week-strip__axis-scroll"
                  data-week-strip-axis-scroll
                >
                  {weekAxisHourLabels.map((label) => (
                    <div
                      key={label}
                      className="calendar-week-strip__axis-hour"
                    >
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              ref={weekStripRef}
              className="calendar-week-strip"
              aria-label="Week calendar strip"
            >
              {weekStripDates.map((date, index) => {
                const ymd = formatLocalYmd(date);
                const isMiddle = index === CALENDAR_WEEK_STRIP_CENTER_INDEX;
                return (
                  <div
                    key={`week-pane-${index}`}
                    className="calendar-week-strip__pane"
                    data-week-pane={index}
                    data-week-ymd={ymd}
                  >
                    <FullCalendar
                      ref={(instance) =>
                        handleWeekPaneInstanceRef(index, instance)
                      }
                      plugins={fcPlugins}
                      initialView="timeGridWeek"
                      initialDate={date}
                      datesSet={isMiddle ? handleDatesSet : undefined}
                      {...weekStripFcProps}
                      events={weekPaneEvents[index] ?? []}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : isMonthStrip ? (
          <div className="calendar-month-strip-shell">
            <div
              className="calendar-month-strip__weekday-rail"
              aria-hidden="true"
            >
              {CALENDAR_MONTH_STRIP_WEEKDAY_LABELS.map((label) => (
                <div key={label} className="calendar-month-strip__weekday">
                  {label}
                </div>
              ))}
            </div>
            <div
              ref={monthStripRef}
              className="calendar-month-strip"
              aria-label="Month calendar strip"
            >
              {monthStripDates.map((date, index) => {
                const ym = formatLocalYm(date);
                const isMiddle = index === CALENDAR_MONTH_STRIP_CENTER_INDEX;
                return (
                  <div
                    key={`month-pane-${index}`}
                    className="calendar-month-strip__pane"
                    data-month-pane={index}
                    data-month-ym={ym}
                  >
                    <FullCalendar
                      ref={(instance) =>
                        handleMonthPaneInstanceRef(index, instance)
                      }
                      plugins={fcPlugins}
                      initialView="dayGridMonth"
                      initialDate={date}
                      datesSet={isMiddle ? handleDatesSet : undefined}
                      {...monthStripFcProps}
                      events={monthPaneEvents[index] ?? []}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : isDayStrip ? (
          <div className="calendar-day-strip-shell">
            <div
              ref={dayAxisRailRef}
              className="calendar-week-strip__axis-rail"
              aria-hidden="true"
            >
              <div className="calendar-week-strip__axis-top" />
              <div className="calendar-week-strip__axis-body">
                <div
                  className="calendar-week-strip__axis-scroll"
                  data-day-strip-axis-scroll
                >
                  {dayAxisHourLabels.map((label) => (
                    <div
                      key={label}
                      className="calendar-week-strip__axis-hour"
                    >
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              ref={dayStripRef}
              className="calendar-day-strip"
              aria-label="Day calendar strip"
            >
              {dayStripDates.map((date, index) => {
                const ymd = formatLocalYmd(date);
                const isMiddle = index === CALENDAR_DAY_STRIP_CENTER_INDEX;
                return (
                  <div
                    key={`day-pane-${index}`}
                    className="calendar-day-strip__pane"
                    data-day-pane={index}
                    data-day-ymd={ymd}
                  >
                    <div className="calendar-day-strip__sticky-header">
                      {formatCalendarDayStripHeaderLabel(date)}
                    </div>
                    <div className="calendar-day-strip__body">
                      <FullCalendar
                        ref={(instance) =>
                          handleDayPaneInstanceRef(index, instance)
                        }
                        plugins={fcPlugins}
                        initialView="timeGridDay"
                        initialDate={date}
                        datesSet={isMiddle ? handleDatesSet : undefined}
                        {...dayStripFcProps}
                        events={dayPaneEvents[index] ?? []}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <FullCalendar
            ref={handleCalendarInstanceRef}
            plugins={fcPlugins}
            initialView={calendarViewModeToFcView(viewMode)}
            datesSet={handleDatesSet}
            {...sharedInteractionProps}
            events={calendarEvents}
          />
        )}
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
      <CalendarBirthdayEventPopover
        open={openBirthdayPopover != null}
        contact={popoverBirthdayContact ?? null}
        occurrenceDate={openBirthdayPopover?.occurrenceDate ?? null}
        anchorRect={openBirthdayPopover?.anchorRect ?? null}
        onClose={() => setOpenBirthdayPopover(null)}
        onViewProfile={onBirthdayOpen}
        onAddNote={onBirthdayAddNote}
        onAddTask={onBirthdayAddTask}
        onAddMeeting={onBirthdayAddMeeting}
        onSendEmail={onBirthdaySendEmail}
      />
    </div>
  );
}
