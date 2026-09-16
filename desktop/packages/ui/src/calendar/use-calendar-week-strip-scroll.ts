import { type RefObject, useEffect, useRef } from "react";

import { resolveCalendarHorizontalPanWheel } from "./calendar-horizontal-date-pan.js";
import { calendarStripCenterIndex } from "./calendar-strip-geometry.js";
import { createCalendarStripRecycleController } from "./calendar-strip-scroll-recycle.js";
import { CALENDAR_WEEK_STRIP_PANE_COUNT } from "./calendar-week-strip.js";

/**
 * Week strip scroll:
 * - Horizontal trackpad/wheel drives the strip (never blocked by recycle).
 * - Vertical wheel still scrolls the time grid; all panes stay in sync.
 * - Five panes keep neighbors warm; recycle near the edges so rebuilds happen
 *   off-screen on rAF after the scroll paint.
 * - Layout equalize is not on the pan path (axis rail / anchor handles it).
 */
export function useCalendarWeekStripScroll({
  stripRef,
  enabled,
  onShiftWeeks,
  paneCount = CALENDAR_WEEK_STRIP_PANE_COUNT,
}: {
  stripRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onShiftWeeks: (weeks: number) => void;
  paneCount?: number;
}) {
  const onShiftRef = useRef(onShiftWeeks);
  onShiftRef.current = onShiftWeeks;

  useEffect(() => {
    if (!enabled) return;
    const strip = stripRef.current;
    if (!strip) return;
    const stripElement: HTMLElement = strip;
    const centerIndex = calendarStripCenterIndex(paneCount);

    const recycle = createCalendarStripRecycleController({
      getPaneSize: () => stripElement.clientWidth,
      getScrollOffset: () => stripElement.scrollLeft,
      setScrollOffset: (value) => {
        stripElement.scrollLeft = value;
      },
      paneCount,
      edgeBuffer: 1,
      onShift: (shift) => onShiftRef.current(shift),
    });

    function liquidScrollers(): HTMLElement[] {
      return [
        ...stripElement.querySelectorAll<HTMLElement>(
          ".fc-scroller-liquid-absolute",
        ),
      ];
    }

    function syncVerticalScroll(source: HTMLElement) {
      const top = source.scrollTop;
      for (const scroller of liquidScrollers()) {
        if (scroller !== source && scroller.scrollTop !== top) {
          scroller.scrollTop = top;
        }
      }
      const axisInner = stripElement.parentElement?.querySelector<HTMLElement>(
        "[data-week-strip-axis-scroll]",
      );
      if (axisInner) {
        axisInner.style.transform = `translateY(${-top}px)`;
      }
    }

    function handleWheel(event: WheelEvent) {
      const horizontal = resolveCalendarHorizontalPanWheel({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
      });

      if (horizontal) {
        event.preventDefault();
        event.stopPropagation();
        stripElement.scrollLeft += horizontal.deltaPx;
        recycle.afterScroll();
        return;
      }

      if (Math.abs(event.deltaY) < 0.5) return;
      const liquids = liquidScrollers();
      if (liquids.length === 0) return;
      const source =
        liquids.find((el) => el.contains(event.target as Node)) ??
        liquids[centerIndex] ??
        liquids[0]!;
      requestAnimationFrame(() => syncVerticalScroll(source));
    }

    function handleLiquidScroll(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("fc-scroller-liquid-absolute")) return;
      syncVerticalScroll(target);
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
    stripElement.addEventListener("scroll", handleLiquidScroll, {
      passive: true,
      capture: true,
    });

    return () => {
      recycle.dispose();
      stripElement.removeEventListener("scroll", handleStripScroll);
      stripElement.removeEventListener("wheel", handleWheel, true);
      stripElement.removeEventListener("scroll", handleLiquidScroll, true);
    };
  }, [enabled, paneCount, stripRef]);
}
