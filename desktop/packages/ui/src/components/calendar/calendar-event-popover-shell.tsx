"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const PANEL_GAP = 10;
const VIEWPORT_PADDING = 12;

export function previewCalendarPopoverDescription(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const plain = value
    .replace(/^#+\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  return plain.length > 220 ? `${plain.slice(0, 217)}…` : plain;
}

export function positionCalendarPopoverPanel(
  anchorRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
): { top: number; left: number } {
  const maxLeft = window.innerWidth - panelWidth - VIEWPORT_PADDING;
  let left = anchorRect.right + PANEL_GAP;
  if (left > maxLeft) {
    left = anchorRect.left - panelWidth - PANEL_GAP;
  }
  left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

  let top = anchorRect.top;
  const maxTop = window.innerHeight - panelHeight - VIEWPORT_PADDING;
  if (top > maxTop) {
    top = maxTop;
  }
  top = Math.max(VIEWPORT_PADDING, top);

  return { top, left };
}

export type UseCalendarEventPopoverPositionOptions = {
  open: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  panelWidth?: number;
  estimatedHeight?: number;
  /** Extra deps that should remeasure (e.g. entity id). */
  contentKey?: string | number | null;
  /**
   * Extra Escape handling before default close (return true to skip default).
   * Meeting popover uses Enter/Space to open details.
   */
  onKeyDown?: (event: KeyboardEvent) => boolean | void;
};

export type UseCalendarEventPopoverPositionResult = {
  panelRef: RefObject<HTMLDivElement | null>;
  panelStyle: CSSProperties;
};

/**
 * Shared positioning + outside-click / Escape / scroll-resize for calendar
 * task and meeting event popovers.
 */
export function useCalendarEventPopoverPosition({
  open,
  anchorRect,
  onClose,
  panelWidth = 360,
  estimatedHeight = 280,
  contentKey = null,
  onKeyDown,
}: UseCalendarEventPopoverPositionOptions): UseCalendarEventPopoverPositionResult {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  const updatePosition = useCallback(() => {
    if (!anchorRect) return;
    const panelHeight = panelRef.current?.offsetHeight ?? estimatedHeight;
    const { top, left } = positionCalendarPopoverPanel(
      anchorRect,
      panelWidth,
      panelHeight,
    );
    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${panelWidth}px`,
      visibility: "visible",
    });
  }, [anchorRect, estimatedHeight, panelWidth]);

  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [anchorRect, contentKey, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (onKeyDown?.(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [onClose, onKeyDown, open, updatePosition]);

  return { panelRef, panelStyle };
}
