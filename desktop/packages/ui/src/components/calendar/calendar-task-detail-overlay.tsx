"use client";

import { XIcon } from "@primer/octicons-react";
import { useEffect, type ReactNode } from "react";

export type CalendarTaskDetailOverlayProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
};

export function CalendarTaskDetailOverlay({
  open,
  onClose,
  children,
  ariaLabel = "Task details",
}: CalendarTaskDetailOverlayProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <aside
      className="calendar-meeting-detail-overlay calendar-meeting-detail-overlay--page calendar-task-detail-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      data-calendar-task-overlay=""
    >
      <div className="calendar-task-detail-overlay__body">
        <div className="meeting-detail-view__overlay-chrome">
          <div className="meeting-detail-view__header-actions">
            <button
              type="button"
              className="meeting-detail-view__header-action"
              onClick={onClose}
              aria-label="Close task details"
            >
              <XIcon size={14} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </aside>
  );
}
