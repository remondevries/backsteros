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

import { formatCalendarTaskScheduleLabel } from "../calendar/calendar-events.js";
import { PropertyFieldGroup } from "./property-field-group.js";
import type { PropertyDropdownTriggerVariant } from "./property-dropdown.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";

const PANEL_WIDTH = 300;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

function toDatetimeLocalValue(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): Date | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type MeetingScheduleDropdownProps = {
  startAt: Date | null;
  endAt: Date | null;
  disabled?: boolean;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  triggerVariant?: PropertyDropdownTriggerVariant;
};

type MeetingSchedulePanelProps = {
  open: boolean;
  onClose: () => void;
  startAt: Date | null;
  endAt: Date | null;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "start" | "end";
};

function MeetingSchedulePanel({
  open,
  onClose,
  startAt,
  endAt,
  onStartChange,
  onEndChange,
  anchorRef,
  align = "start",
}: MeetingSchedulePanelProps) {
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

    const panelHeight = panelRef.current?.offsetHeight ?? 200;
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
  }, [open, startAt, endAt, updatePosition]);

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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="searchable-dropdown-panel meeting-schedule-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <p id={titleId} className="visually-hidden">Meeting schedule</p>
      <PropertyFieldGroup label="Starts">
        <input
          type="datetime-local"
          className="property-datetime-input"
          value={toDatetimeLocalValue(startAt)}
          disabled={!onStartChange}
          aria-label="Meeting starts"
          onChange={(event) => {
            const next = fromDatetimeLocalValue(event.target.value);
            if (next) onStartChange?.(next);
          }}
        />
      </PropertyFieldGroup>
      <PropertyFieldGroup label="Ends">
        <input
          type="datetime-local"
          className="property-datetime-input"
          value={toDatetimeLocalValue(endAt)}
          disabled={!onEndChange}
          aria-label="Meeting ends"
          onChange={(event) => {
            const next = fromDatetimeLocalValue(event.target.value);
            if (next) onEndChange?.(next);
          }}
        />
      </PropertyFieldGroup>
    </div>,
    document.body,
  );
}

/**
 * Task-style property chip for meeting start/end with datetime pickers in-panel.
 */
export function MeetingScheduleDropdown({
  startAt,
  endAt,
  disabled = false,
  onStartChange,
  onEndChange,
  triggerVariant = "inlineChip",
}: MeetingScheduleDropdownProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasSchedule = Boolean(
    startAt && !Number.isNaN(startAt.getTime()),
  );
  const label =
    formatCalendarTaskScheduleLabel(startAt, endAt) ?? "Set schedule";
  const isDisabled = disabled || (!onStartChange && !onEndChange);

  return (
    <div ref={anchorRef} className="meeting-schedule-dropdown">
      <button
        type="button"
        className={[
          "property-dropdown-trigger",
          triggerVariant === "inlineChip"
            ? "property-dropdown-trigger--inline-chip"
            : null,
          open ? "is-open" : null,
          !hasSchedule ? "is-muted" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-task-property-dropdown="dueDate"
        disabled={isDisabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Meeting schedule: ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          <TaskDueDateIcon active={hasSchedule || open} size={14} />
        </span>
        <span className="property-dropdown-trigger__label">{label}</span>
      </button>
      <MeetingSchedulePanel
        open={open}
        onClose={() => setOpen(false)}
        startAt={startAt}
        endAt={endAt}
        onStartChange={onStartChange}
        onEndChange={onEndChange}
        anchorRef={anchorRef}
      />
    </div>
  );
}
