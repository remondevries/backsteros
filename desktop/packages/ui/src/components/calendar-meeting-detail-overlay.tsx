"use client";

import { useEffect } from "react";

import {
  MeetingDetailView,
  type MeetingDetailViewProps,
} from "./meeting-detail-view.js";

export type CalendarMeetingDetailOverlayProps = {
  open: boolean;
  onClose: () => void;
} & MeetingDetailViewProps;

export function CalendarMeetingDetailOverlay({
  open,
  onClose,
  ...detailProps
}: CalendarMeetingDetailOverlayProps) {
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

  const { displayId } = detailProps;

  return (
    <aside
      className="calendar-meeting-detail-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={`Meeting ${displayId}`}
      data-calendar-meeting-overlay=""
    >
      <MeetingDetailView layout="panel" onClose={onClose} {...detailProps} />
    </aside>
  );
}
