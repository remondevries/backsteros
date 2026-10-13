import { type RefObject, useEffect, useRef } from "react";

import { createCalendarStripRecycleController } from "./calendar-strip-scroll-recycle.js";
import {
  CALENDAR_MONTH_STRIP_CENTER_INDEX,
  CALENDAR_MONTH_STRIP_PANE_COUNT,
} from "./calendar-month-strip.js";

/**
 * Month strip scroll:
 * - Vertical wheel drives the strip (FC daygrid scrollers are suppressed).
 * - Recycle near edges on rAF so remounts do not freeze the gesture.
 */
export function useCalendarMonthStripScroll({
  stripRef,
  enabled,
  onShiftMonths,
  paneCount = CALENDAR_MONTH_STRIP_PANE_COUNT,
}: {
  stripRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onShiftMonths: (months: number) => void;
  paneCount?: number;
}) {
  const onShiftRef = useRef(onShiftMonths);
  onShiftRef.current = onShiftMonths;

  useEffect(() => {
    if (!enabled) return;
    const strip = stripRef.current;
    if (!strip) return;
    const stripElement: HTMLElement = strip;

    const recycle = createCalendarStripRecycleController({
      getPaneSize: () => stripElement.clientHeight,
      getScrollOffset: () => stripElement.scrollTop,
      setScrollOffset: (value) => {
        stripElement.scrollTop = value;
      },
      paneCount,
      edgeBuffer: 2,
      onShift: (shift) => onShiftRef.current(shift),
    });

    function handleWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < 0.5 && Math.abs(event.deltaX) < 0.5) {
        return;
      }

      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) || event.shiftKey
          ? event.deltaY || event.deltaX
          : event.deltaY;

      if (Math.abs(delta) < 0.5) return;

      event.preventDefault();
      event.stopPropagation();
      stripElement.scrollTop += delta;
      recycle.afterScroll();
    }

    function handleStripScroll() {
      recycle.afterScroll();
    }

    stripElement.addEventListener("scroll", handleStripScroll, {
      passive: true,
    });
    stripElement.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      recycle.dispose();
      stripElement.removeEventListener("scroll", handleStripScroll);
      stripElement.removeEventListener("wheel", handleWheel, true);
    };
  }, [enabled, paneCount, stripRef]);
}

export { CALENDAR_MONTH_STRIP_CENTER_INDEX };
