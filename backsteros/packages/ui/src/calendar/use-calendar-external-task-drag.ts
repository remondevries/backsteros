"use client";

import { useEffect, type RefObject } from "react";

import { Draggable } from "@fullcalendar/interaction";

import {
  applyCalendarExternalDragMirrorAppearance,
  anchorTimelineDragMirrorToCursor,
  calendarExternalDragEventData,
} from "./calendar-task-drag.js";

export type ExternalDragPointerEvent = {
  subjectEl: HTMLElement;
  pageX: number;
  pageY: number;
};

export type UseCalendarExternalTaskDragOptions = {
  enabled?: boolean;
  itemSelector?: string;
  /** Mirror parent while dragging (use `document.body` for cross-panel drags). */
  appendTo?: HTMLElement | null;
  minDistance?: number;
  /** Fires once the pointer has moved past `minDistance` (real drag, not click). */
  onDragStart?: (ev: ExternalDragPointerEvent) => void;
  onDragEnd?: (ev: ExternalDragPointerEvent) => void;
};

/**
 * Wire a list container for FullCalendar external drag onto droppable
 * calendars (journal footer, calendar side panel).
 */
export function useCalendarExternalTaskDrag(
  containerRef: RefObject<HTMLElement | null>,
  {
    enabled = true,
    itemSelector = "[data-calendar-task-id]",
    appendTo,
    minDistance = 5,
    onDragStart,
    onDragEnd,
  }: UseCalendarExternalTaskDragOptions = {},
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const mirrorParent =
      appendTo ??
      (typeof document !== "undefined" ? document.body : undefined);

    const draggable = new Draggable(container, {
      itemSelector,
      eventData: (element) => calendarExternalDragEventData(element),
      appendTo: mirrorParent,
      minDistance,
    });

    const { dragging } = draggable;
    let lastPointer: ExternalDragPointerEvent | null = null;

    const syncExternalMirror = (ev: ExternalDragPointerEvent) => {
      lastPointer = {
        subjectEl: ev.subjectEl,
        pageX: ev.pageX,
        pageY: ev.pageY,
      };
      const mirrorEl = dragging.mirror.getMirrorEl();
      if (!mirrorEl) return;
      applyCalendarExternalDragMirrorAppearance(mirrorEl, ev.subjectEl);
      anchorTimelineDragMirrorToCursor(mirrorEl, ev.pageX, ev.pageY);
    };

    const handleDragStart = (ev: ExternalDragPointerEvent) => {
      document.documentElement.classList.add("is-calendar-external-dragging");
      syncExternalMirror(ev);
      onDragStart?.(ev);
    };

    const handleDragPointer = (ev: ExternalDragPointerEvent) => {
      syncExternalMirror(ev);
    };

    const handleDragEnd = (ev: ExternalDragPointerEvent) => {
      document.documentElement.classList.remove("is-calendar-external-dragging");
      const subjectEl = ev.subjectEl ?? lastPointer?.subjectEl;
      const pageX = Number.isFinite(ev.pageX)
        ? ev.pageX
        : (lastPointer?.pageX ?? 0);
      const pageY = Number.isFinite(ev.pageY)
        ? ev.pageY
        : (lastPointer?.pageY ?? 0);
      lastPointer = null;
      if (!subjectEl) return;
      onDragEnd?.({ subjectEl, pageX, pageY });
    };

    dragging.emitter.on("dragstart", handleDragStart);
    dragging.emitter.on("dragmove", handleDragPointer);
    dragging.emitter.on("dragend", handleDragEnd);

    return () => {
      document.documentElement.classList.remove("is-calendar-external-dragging");
      dragging.emitter.off("dragstart", handleDragStart);
      dragging.emitter.off("dragmove", handleDragPointer);
      dragging.emitter.off("dragend", handleDragEnd);
      draggable.destroy();
    };
  }, [
    appendTo,
    containerRef,
    enabled,
    itemSelector,
    minDistance,
    onDragEnd,
    onDragStart,
  ]);
}
