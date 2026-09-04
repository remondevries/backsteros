"use client";

import { useEffect } from "react";

import type { CalendarMeetingOverlayLayout } from "../../calendar/calendar-meeting-overlay.js";
import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";
import { ProjectsSidePanelIcon } from "../codebase/projects-side-panel-icon.js";
import { CollapseLayoutIcon } from "../icons/collapse-layout-icon.js";
import { ExpandLayoutIcon } from "../icons/expand-layout-icon.js";
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

/**
 * Left-side meeting note card — mirrors the contact detail card chrome,
 * with hide/expand icons flipped for a panel that opens from the left.
 */
export function CalendarMeetingDetailOverlay({
  open,
  onClose,
  overlayLayout = "panel",
  onExpand,
  onCollapse,
  ...detailProps
}: CalendarMeetingDetailOverlayProps) {
  const layout = overlayLayout === "page" ? "page" : "panel";

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!shouldHandleGlobalShortcut(event)) return;

      // Narrow panel → Enter expands to full-width page layout.
      if (
        event.key === "Enter" &&
        layout === "panel" &&
        onExpand &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onExpand();
        return;
      }

      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      // Expanded page → Escape collapses to narrow; narrow → Escape closes.
      if (layout === "page" && onCollapse) {
        onCollapse();
        return;
      }
      onClose();
    }

    // Capture phase — same pattern as contacts overlay Escape handling.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [layout, onClose, onCollapse, onExpand, open]);

  if (!open) return null;

  const { displayId } = detailProps;

  const layoutAction =
    layout === "panel" && onExpand ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon calendar-meeting-detail-overlay__layout-action"
        onClick={onExpand}
        aria-label="Expand meeting"
        title="Expand (Enter)"
      >
        <ExpandLayoutIcon size={14} />
      </button>
    ) : layout === "page" && onCollapse ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon calendar-meeting-detail-overlay__layout-action"
        onClick={onCollapse}
        aria-label="Collapse meeting"
        title="Collapse (Esc)"
      >
        <CollapseLayoutIcon size={14} />
      </button>
    ) : null;

  const hideAction = (
    <button
      type="button"
      className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
      onClick={onClose}
      title={layout === "page" ? "Hide meeting" : "Hide meeting (Esc)"}
      aria-label="Hide meeting"
    >
      <ProjectsSidePanelIcon size={16} collapsed={false} rail="start" />
    </button>
  );

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
      <div className="calendar-meeting-detail-overlay__card">
        <div
          className="desktop-journal-day-layout__chrome calendar-meeting-detail-overlay__chrome"
          data-calendar-meeting-overlay-chrome=""
        >
          <div className="desktop-agent-surface-tab-actions calendar-meeting-detail-overlay__chrome-start">
            {hideAction}
          </div>
          {layoutAction ? (
            <div className="desktop-agent-surface-tab-actions calendar-meeting-detail-overlay__chrome-end">
              {layoutAction}
            </div>
          ) : null}
        </div>
        <div className="desktop-journal-day-layout__calendar-body calendar-meeting-detail-overlay__body">
          <MeetingDetailView
            {...detailProps}
            layout={layout}
            contentTabShortcutsEnabled
          />
        </div>
      </div>
    </aside>
  );
}
