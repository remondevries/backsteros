import { type RefObject, useEffect } from "react";

import type { CalendarApi } from "@fullcalendar/core";

import type { CalendarViewMode } from "./calendar-view-modes.js";
import {
  accumulateCalendarHorizontalDatePan,
  CALENDAR_HORIZONTAL_DATE_PAN_LOCK_MS,
  createCalendarHorizontalDatePanState,
  resolveCalendarHorizontalPanWheel,
  shouldPreventCalendarPageHorizontalScroll,
} from "./calendar-horizontal-date-pan.js";

/**
 * Week / day: horizontal trackpad (or shift+wheel) pans the visible date window
 * day-by-day. Vertical time-grid scrolling stays untouched.
 */
export function useCalendarHorizontalDatePan({
  containerRef,
  calendarApiRef,
  viewMode,
  enabled = true,
}: {
  containerRef: RefObject<HTMLElement | null>;
  calendarApiRef: RefObject<CalendarApi | null>;
  viewMode: CalendarViewMode;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    if (viewMode !== "week" && viewMode !== "day") return;

    const container = containerRef.current;
    if (!container) return;

    let panState = createCalendarHorizontalDatePanState();
    let lockedUntil = 0;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;

    function clearLockTimer() {
      if (lockTimer != null) {
        clearTimeout(lockTimer);
        lockTimer = null;
      }
    }

    function armHorizontalLock() {
      lockedUntil = Date.now() + CALENDAR_HORIZONTAL_DATE_PAN_LOCK_MS;
      clearLockTimer();
      lockTimer = setTimeout(() => {
        lockedUntil = 0;
        lockTimer = null;
      }, CALENDAR_HORIZONTAL_DATE_PAN_LOCK_MS);
    }

    function handleWheel(event: WheelEvent) {
      const locked = Date.now() < lockedUntil;
      const input = {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        locked,
      };

      // Block page / webview rubber-banding for horizontal intent, even before
      // a day step fires. Capture phase so FC / parents never see it first.
      if (shouldPreventCalendarPageHorizontalScroll(input)) {
        event.preventDefault();
        event.stopPropagation();
      }

      const resolved = resolveCalendarHorizontalPanWheel(input, { locked });
      if (!resolved) return;

      const api = calendarApiRef.current;
      if (!api?.incrementDate) return;

      armHorizontalLock();

      const { nextState, dayDelta } = accumulateCalendarHorizontalDatePan(
        panState,
        resolved.deltaPx,
      );
      panState = nextState;
      if (dayDelta === 0) return;
      api.incrementDate({ days: dayDelta });
    }

    container.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      clearLockTimer();
      container.removeEventListener("wheel", handleWheel, true);
    };
  }, [calendarApiRef, containerRef, enabled, viewMode]);
}
