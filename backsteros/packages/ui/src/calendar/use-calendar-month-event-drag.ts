"use client";

import { useEffect, useRef, type RefObject } from "react";

import { resolveCalendarDropAtPoint } from "./calendar-task-drag.js";

export type CalendarMonthEventDragTarget = {
  taskId: string;
  allDay: boolean;
  previousStart: Date;
  previousEnd: Date | null;
};

export type UseCalendarMonthEventDragOptions = {
  enabled?: boolean;
  minDistance?: number;
  /** Resolve the FC event element to the task schedule being moved. */
  resolveTarget: (
    eventEl: HTMLElement,
  ) => CalendarMonthEventDragTarget | null;
  /** Month day under the pointer — keep clock time in the caller. */
  onMoveToDate: (input: {
    taskId: string;
    dateYmd: string;
    allDay: boolean;
    previousStart: Date;
    previousEnd: Date | null;
  }) => void;
  /** Plain click (no drag) — open / inspect the task. */
  onClick?: (taskId: string, eventEl: HTMLElement) => void;
};

const MIRROR_CURSOR_OFFSET = { x: 12, y: 10 };

/**
 * Month-strip CSS (`display: contents` + packed day grid) breaks FullCalendar
 * day hit-testing, so native EventDragging never starts (`requireInitial` hit
 * is null). This pointer drag owns month-view task moves via elementFromPoint.
 *
 * Important: FC listens to `mousedown`, not `pointerdown`. We must
 * `preventDefault()` on pointerdown so the compatibility mouse events never
 * fire — otherwise FC still spawns a broken mirror at (0,0).
 */
export function useCalendarMonthEventDrag(
  containerRef: RefObject<HTMLElement | null>,
  {
    enabled = true,
    minDistance = 8,
    resolveTarget,
    onMoveToDate,
    onClick,
  }: UseCalendarMonthEventDragOptions,
): void {
  const resolveTargetRef = useRef(resolveTarget);
  resolveTargetRef.current = resolveTarget;
  const onMoveToDateRef = useRef(onMoveToDate);
  onMoveToDateRef.current = onMoveToDate;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let target: CalendarMonthEventDragTarget | null = null;
    let eventEl: HTMLElement | null = null;
    let mirrorEl: HTMLElement | null = null;

    const restoreSource = () => {
      if (!eventEl) return;
      eventEl.classList.remove("calendar-month-event-drag-source");
      eventEl.style.opacity = "";
    };

    const clearMirror = () => {
      const mirror = mirrorEl;
      mirrorEl = null;
      document.documentElement.classList.remove("is-calendar-month-event-dragging");
      restoreSource();
      if (!mirror) return;
      mirror.style.visibility = "hidden";
      mirror.style.opacity = "0";
      mirror.remove();
    };

    const placeMirror = (clientX: number, clientY: number) => {
      if (!mirrorEl) return;
      const x = Math.round(clientX + MIRROR_CURSOR_OFFSET.x);
      const y = Math.round(clientY + MIRROR_CURSOR_OFFSET.y);
      mirrorEl.style.setProperty("left", `${x}px`, "important");
      mirrorEl.style.setProperty("top", `${y}px`, "important");
      mirrorEl.style.setProperty("visibility", "visible", "important");
    };

    const ensureMirror = (
      source: HTMLElement,
      clientX: number,
      clientY: number,
    ) => {
      if (mirrorEl) return;

      const content =
        source.querySelector<HTMLElement>(".fc-event-main") ??
        source.querySelector<HTMLElement>(".task-calendar-event__content") ??
        source;

      const mirror = document.createElement("div");
      mirror.className = "calendar-month-event-drag-mirror";
      mirror.setAttribute("aria-hidden", "true");
      // Inline the positioning model so no stylesheet can leave it at 0,0.
      mirror.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "z-index:2147483646",
        "margin:0",
        "padding:0",
        "border:0",
        "pointer-events:none",
        "visibility:hidden",
        "transform:none",
        "inset:auto",
      ].join(";");

      const chip = document.createElement("div");
      chip.className = [
        "task-calendar-event",
        "calendar-month-event-drag-mirror__chip",
        source.classList.contains("social-planned-calendar-event")
          ? "social-planned-calendar-event"
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const computed = getComputedStyle(source);
      const bg = source.style.backgroundColor || computed.backgroundColor;
      const border = source.style.borderColor || computed.borderColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        chip.style.backgroundColor = bg;
      }
      if (border && border !== "rgba(0, 0, 0, 0)" && border !== "transparent") {
        chip.style.borderColor = border;
      }
      chip.style.width = `${Math.max(source.offsetWidth, 96)}px`;
      chip.style.pointerEvents = "none";
      chip.appendChild(content.cloneNode(true));
      mirror.appendChild(chip);

      document.body.appendChild(mirror);
      mirrorEl = mirror;

      document.documentElement.classList.add("is-calendar-month-event-dragging");
      source.classList.add("calendar-month-event-drag-source");
      source.style.opacity = "0.35";
      placeMirror(clientX, clientY);
    };

    const suppressClick = (el: HTMLElement) => {
      const block = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        el.removeEventListener("click", block, true);
      };
      el.addEventListener("click", block, true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      if (!target || !eventEl) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!dragging) {
        if (dx * dx + dy * dy < minDistance * minDistance) return;
        dragging = true;
        ensureMirror(eventEl, event.clientX, event.clientY);
      } else {
        placeMirror(event.clientX, event.clientY);
      }
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      const activeTarget = target;
      const activeEl = eventEl;
      const didDrag = dragging;
      const clientX = event.clientX;
      const clientY = event.clientY;

      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      pointerId = null;
      dragging = false;
      clearMirror();
      target = null;
      eventEl = null;

      if (!activeTarget || !activeEl) return;

      event.preventDefault();
      event.stopPropagation();

      if (!didDrag) {
        onClickRef.current?.(activeTarget.taskId, activeEl);
        return;
      }

      suppressClick(activeEl);
      const drop = resolveCalendarDropAtPoint(clientX, clientY);
      if (!drop?.allDay || !drop.dateYmd) return;
      onMoveToDateRef.current({
        taskId: activeTarget.taskId,
        dateYmd: drop.dateYmd,
        allDay: activeTarget.allDay,
        previousStart: activeTarget.previousStart,
        previousEnd: activeTarget.previousEnd,
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (pointerId != null) return;
      const rawTarget = event.target;
      if (!(rawTarget instanceof Element)) return;
      const found = rawTarget.closest<HTMLElement>(".fc-event.fc-event-draggable");
      if (!found || !container.contains(found)) return;
      if (found.classList.contains("birthday-calendar-event")) return;
      if (found.classList.contains("external-calendar-event")) return;

      const resolved = resolveTargetRef.current(found);
      if (!resolved) return;

      // Kill FC's mousedown path (it does not listen to pointerdown).
      event.preventDefault();
      event.stopPropagation();

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dragging = false;
      target = resolved;
      eventEl = found;

      window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("pointercancel", onPointerUp, true);
    };

    // Belt-and-suspenders: if a mouse event still arrives, don't let FC see it
    // while we own a month-event gesture.
    const blockFcMouseWhileOwned = (event: MouseEvent) => {
      if (pointerId == null) return;
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("mousedown", blockFcMouseWhileOwned, true);
    container.addEventListener("mouseup", blockFcMouseWhileOwned, true);
    container.addEventListener("click", blockFcMouseWhileOwned, true);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("mousedown", blockFcMouseWhileOwned, true);
      container.removeEventListener("mouseup", blockFcMouseWhileOwned, true);
      container.removeEventListener("click", blockFcMouseWhileOwned, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      clearMirror();
      pointerId = null;
      target = null;
      eventEl = null;
      dragging = false;
    };
  }, [containerRef, enabled, minDistance]);
}
