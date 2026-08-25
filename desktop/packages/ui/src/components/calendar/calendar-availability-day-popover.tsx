"use client";

import { PencilIcon, TrashIcon, XIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import type { MeetingWeekdayHoursEntry } from "@backsteros/contracts";

import { weekdayLabel } from "../../calendar/calendar-availability-events.js";
import { formatWeekdaySlotsLabel } from "../../calendar/calendar-availability-slots.js";

const PANEL_WIDTH = 300;
const PANEL_GAP = 10;
const VIEWPORT_PADDING = 12;

export type CalendarAvailabilityDayPopoverProps = {
  open: boolean;
  anchorRect: DOMRect | null;
  entry: MeetingWeekdayHoursEntry | null;
  ymd: string | null;
  onClose: () => void;
  onSave: (slots: MeetingWeekdayHoursEntry["slots"]) => void;
  onRemove: () => void;
};

function formatDayHeading(ymd: string, weekday: number): string {
  const date = new Date(`${ymd}T12:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? ymd
    : date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
  return dateLabel || weekdayLabel(weekday);
}

function positionPanel(
  anchorRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
): { top: number; left: number } {
  const maxLeft = window.innerWidth - panelWidth - VIEWPORT_PADDING;
  let left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

  let top = anchorRect.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - panelHeight - VIEWPORT_PADDING;
  if (top > maxTop) {
    top = anchorRect.top - panelHeight - PANEL_GAP;
  }
  top = Math.max(VIEWPORT_PADDING, top);

  return { top, left };
}

export function CalendarAvailabilityDayPopover({
  open,
  anchorRect,
  entry,
  ymd,
  onClose,
  onSave,
  onRemove,
}: CalendarAvailabilityDayPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [draftSlots, setDraftSlots] = useState<MeetingWeekdayHoursEntry["slots"]>(
    [],
  );
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  useEffect(() => {
    if (!open) {
      setEditing(false);
      return;
    }
    if (!entry) return;
    setDraftSlots(entry.slots.map((slot) => ({ ...slot })));
  }, [entry, open]);

  const updatePosition = useCallback(() => {
    if (!anchorRect) return;
    const panelHeight = panelRef.current?.offsetHeight ?? 160;
    const { top, left } = positionPanel(anchorRect, PANEL_WIDTH, panelHeight);
    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${PANEL_WIDTH}px`,
      visibility: "visible",
    });
  }, [anchorRect]);

  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [anchorRect, draftSlots.length, editing, entry?.weekday, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editing) {
          if (entry) {
            setDraftSlots(entry.slots.map((slot) => ({ ...slot })));
          }
          setEditing(false);
          return;
        }
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
  }, [editing, entry, onClose, open, updatePosition]);

  const handleSave = useCallback(() => {
    if (!entry) return;
    if (draftSlots.some((slot) => slot.start >= slot.end)) return;
    onSave(draftSlots);
    setEditing(false);
  }, [draftSlots, entry, onSave]);

  if (!open || !entry || !ymd || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const showActions = !editing;

  return createPortal(
    <div
      ref={panelRef}
      className="calendar-availability-day-popover searchable-dropdown-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-calendar-availability-day-popover=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="calendar-availability-day-popover__shell">
        {showActions ? (
          <div
            className="email-thread-comment__actions calendar-availability-day-popover__actions"
            role="toolbar"
            aria-label="Availability actions"
          >
            <button
              type="button"
              className="email-thread-comment__action email-thread-comment__action--edit"
              aria-label="Edit hours"
              title="Edit"
              onClick={() => setEditing(true)}
            >
              <PencilIcon size={14} />
            </button>
            <button
              type="button"
              className="email-thread-comment__action email-thread-comment__action--delete"
              aria-label="Remove day"
              title="Remove"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ) : null}
        <div className="calendar-availability-day-popover__card">
          <div className="calendar-availability-day-popover__header">
            <h3 id={titleId} className="calendar-availability-day-popover__title">
              {formatDayHeading(ymd, entry.weekday)}
            </h3>
            <button
              type="button"
              className="calendar-availability-day-popover__close"
              aria-label="Close"
              onClick={onClose}
            >
              <XIcon size={14} />
            </button>
          </div>
          {editing ? (
            <div className="calendar-availability-day-popover__edit">
              <p className="calendar-availability-day-popover__hint">
                Applies every {weekdayLabel(entry.weekday)}.
              </p>
              {draftSlots.map((slot, index) => (
                <div key={index} className="calendar-availability-day-times">
                  <input
                    type="time"
                    className="calendar-availability-time-input"
                    value={slot.start}
                    aria-label={`${weekdayLabel(entry.weekday)} slot ${index + 1} start`}
                    onChange={(event) =>
                      setDraftSlots((current) =>
                        current.map((entrySlot, slotIndex) =>
                          slotIndex === index
                            ? { ...entrySlot, start: event.target.value }
                            : entrySlot,
                        ),
                      )
                    }
                  />
                  <span className="calendar-availability-time-separator">–</span>
                  <input
                    type="time"
                    className="calendar-availability-time-input"
                    value={slot.end}
                    aria-label={`${weekdayLabel(entry.weekday)} slot ${index + 1} end`}
                    onChange={(event) =>
                      setDraftSlots((current) =>
                        current.map((entrySlot, slotIndex) =>
                          slotIndex === index
                            ? { ...entrySlot, end: event.target.value }
                            : entrySlot,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <div className="calendar-availability-day-popover__edit-actions">
                <button
                  type="button"
                  className="email-thread-comment__edit-cancel"
                  onClick={() => {
                    setDraftSlots(entry.slots.map((slot) => ({ ...slot })));
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="email-thread-comment__edit-save"
                  onClick={handleSave}
                  disabled={draftSlots.some((slot) => slot.start >= slot.end)}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="calendar-availability-day-popover__schedule">
                {formatWeekdaySlotsLabel(entry)}
              </p>
              <p className="calendar-availability-day-popover__hint">
                Applies every {weekdayLabel(entry.weekday)}.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
