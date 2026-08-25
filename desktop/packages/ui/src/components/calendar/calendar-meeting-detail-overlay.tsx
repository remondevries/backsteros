"use client";

import { useEffect } from "react";

import type { CalendarMeetingOverlayLayout } from "../../calendar/calendar-meeting-overlay.js";
import {
  MeetingDetailView,
  type MeetingDetailViewProps,
} from "../meetings/meeting-detail-view.js";

export type CalendarMeetingDetailOverlayProps = {
  open: boolean;
  onClose: () => void;
  /** Narrow side panel vs full-width page layout over the calendar. */
  overlayLayout?: CalendarMeetingOverlayLayout;
  /** Expand the narrow panel to full-width page layout. */
  onExpand?: () => void;
  /** Collapse full-width page layout back to the narrow panel. */
  onCollapse?: () => void;
} & MeetingDetailViewProps;

export function CalendarMeetingDetailOverlay({
  open,
  onClose,
  overlayLayout = "panel",
  onExpand,
  onCollapse,
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
  const layout = overlayLayout === "page" ? "page" : "panel";

  return (
    <aside
      className={[
        "calendar-meeting-detail-overlay",
        layout === "page" ? "calendar-meeting-detail-overlay--page" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="false"
      aria-label={`Meeting ${displayId}`}
      data-calendar-meeting-overlay=""
      data-calendar-meeting-overlay-layout={layout}
    >
      <MeetingDetailView
        {...detailProps}
        layout={layout}
        onClose={onClose}
        onExpand={layout === "panel" ? onExpand : undefined}
        onCollapse={layout === "page" ? onCollapse : undefined}
      />
    </aside>
  );
}
