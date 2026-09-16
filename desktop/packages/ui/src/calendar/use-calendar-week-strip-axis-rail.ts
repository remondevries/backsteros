"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

import { syncCalendarWeekStripAllDayHeights } from "./calendar-week-strip-layout.js";
import { CALENDAR_WEEK_STRIP_CENTER_INDEX } from "./calendar-week-strip.js";
import { CALENDAR_DAY_STRIP_CENTER_INDEX } from "./calendar-day-strip.js";

const HOUR_LABELS = [
  "12am",
  "1am",
  "2am",
  "3am",
  "4am",
  "5am",
  "6am",
  "7am",
  "8am",
  "9am",
  "10am",
  "11am",
  "12pm",
  "1pm",
  "2pm",
  "3pm",
  "4pm",
  "5pm",
  "6pm",
  "7pm",
  "8pm",
  "9pm",
  "10pm",
  "11pm",
];

/**
 * Mirror FullCalendar's hour labels in a fixed rail so the timeline stays put
 * while a week (horizontal) or day (vertical) strip scrolls. Also equalizes
 * all-day lane heights across panes — but only on resize / anchor change, not
 * on every pan tick.
 */
export function useCalendarWeekStripAxisRail({
  stripRef,
  enabled,
  anchorKey,
  /** `week` queries `[data-week-pane]`; `day` queries `[data-day-pane]`. */
  variant = "week",
}: {
  stripRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  anchorKey: string;
  variant?: "week" | "day";
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const centerIndex =
    variant === "day"
      ? CALENDAR_DAY_STRIP_CENTER_INDEX
      : CALENDAR_WEEK_STRIP_CENTER_INDEX;
  const paneAttr = variant === "day" ? "data-day-pane" : "data-week-pane";
  const axisScrollAttr =
    variant === "day"
      ? "data-day-strip-axis-scroll"
      : "data-week-strip-axis-scroll";

  // Long-lived observer on the strip only — avoid re-binding dozens of FC
  // scroller nodes on every week recycle.
  useLayoutEffect(() => {
    if (!enabled) return;
    const strip = stripRef.current;
    const rail = railRef.current;
    if (!strip || !rail) return;

    const sync = () => {
      syncCalendarWeekStripAllDayHeights(strip, paneAttr);

      const middle = strip.querySelector<HTMLElement>(
        `[${paneAttr}="${centerIndex}"]`,
      );
      if (!middle) return;

      const slot = middle.querySelector<HTMLElement>(".fc-timegrid-slot");
      const liquid = middle.querySelector<HTMLElement>(
        ".fc-scroller-liquid-absolute",
      );
      const slotHeight = slot?.getBoundingClientRect().height ?? 24;
      const hourPitch = slotHeight * 2;
      const topSpacer = [
        ...middle.querySelectorAll<HTMLElement>(".fc-timegrid .fc-scroller"),
      ]
        .filter((el) => !el.classList.contains("fc-scroller-liquid-absolute"))
        .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);

      const stickyHeader =
        variant === "day"
          ? middle
              .closest("[data-day-pane]")
              ?.querySelector<HTMLElement>(".calendar-day-strip__sticky-header")
          : null;
      const stickyHeight = stickyHeader?.getBoundingClientRect().height ?? 0;

      rail.style.setProperty(
        "--week-strip-axis-top",
        `${topSpacer + stickyHeight}px`,
      );
      rail.style.setProperty("--week-strip-hour-pitch", `${hourPitch}px`);

      const scrollEl = rail.querySelector<HTMLElement>(`[${axisScrollAttr}]`);
      if (scrollEl && liquid) {
        scrollEl.style.transform = `translateY(${-liquid.scrollTop}px)`;
      }

      const axis = middle.querySelector<HTMLElement>(".fc-timegrid-axis");
      const axisWidth = axis?.getBoundingClientRect().width || 41;
      rail.style.width = `${axisWidth}px`;
    };

    let rafId = 0;
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(sync);
    };

    sync();
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(strip);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [axisScrollAttr, centerIndex, enabled, paneAttr, stripRef, variant]);

  // Date recycle: panes stay mounted (stable keys) but FC gotoDate can change
  // all-day content — one equalize pass after the anchor moves.
  useLayoutEffect(() => {
    if (!enabled) return;
    const strip = stripRef.current;
    if (!strip) return;
    const rafId = requestAnimationFrame(() => {
      syncCalendarWeekStripAllDayHeights(strip, paneAttr);
    });
    return () => cancelAnimationFrame(rafId);
  }, [anchorKey, enabled, paneAttr, stripRef]);

  return { railRef, hourLabels: HOUR_LABELS };
}
