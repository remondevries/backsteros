"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { DueDateCalendar } from "./due-date-calendar.js";

const PANEL_WIDTH = 280;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

export type DueDateCalendarPopoverProps = {
  open: boolean;
  onClose: () => void;
  value: string | null | undefined;
  onSelect: (ymd: string) => void;
  /** Anchor element (dropdown trigger wrapper). */
  anchorRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  align?: "start" | "end";
};

/**
 * Anchored popover hosting {@link DueDateCalendar}.
 * Used when the user chooses “Pick a date…” on desktop / web.
 */
export function DueDateCalendarPopover({
  open,
  onClose,
  value,
  onSelect,
  anchorRef,
  disabled = false,
  align = "start",
}: DueDateCalendarPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const trigger =
      anchor.querySelector("button") ??
      (anchor instanceof HTMLButtonElement ? anchor : null) ??
      anchor;
    const rect = trigger.getBoundingClientRect();
    const width = PANEL_WIDTH;
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      visibility: "visible",
    });
  }, [align, anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition, value]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [anchorRef, onClose, open, updatePosition]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className="due-date-calendar-popover searchable-dropdown-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-due-date-calendar-popover=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="due-date-calendar-popover__heading" id={titleId}>
        Pick a date
      </div>
      <DueDateCalendar
        value={value}
        disabled={disabled}
        onSelect={(ymd) => {
          onSelect(ymd);
          onClose();
        }}
      />
    </div>,
    document.body,
  );
}
