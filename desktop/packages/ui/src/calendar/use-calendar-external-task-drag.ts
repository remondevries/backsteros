"use client";

import { useEffect, type RefObject } from "react";

import { Draggable } from "@fullcalendar/interaction";

import {
  applyCalendarExternalDragMirrorAppearance,
  anchorTimelineDragMirrorToCursor,
  calendarExternalDragEventData,
} from "./calendar-task-drag.js";

type ExternalDragPointerEvent = {
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

    const syncExternalMirror = (ev: ExternalDragPointerEvent) => {
      const mirrorEl = dragging.mirror.getMirrorEl();
      if (!mirrorEl) return;
      applyCalendarExternalDragMirrorAppearance(mirrorEl, ev.subjectEl);
      anchorTimelineDragMirrorToCursor(mirrorEl, ev.pageX, ev.pageY);
    };

    const handleDragPointer = (ev: ExternalDragPointerEvent) => {
      syncExternalMirror(ev);
    };

    dragging.emitter.on("dragstart", handleDragPointer);
    dragging.emitter.on("dragmove", handleDragPointer);

    return () => {
      dragging.emitter.off("dragstart", handleDragPointer);
      dragging.emitter.off("dragmove", handleDragPointer);
      draggable.destroy();
    };
  }, [appendTo, containerRef, enabled, itemSelector, minDistance]);
}
