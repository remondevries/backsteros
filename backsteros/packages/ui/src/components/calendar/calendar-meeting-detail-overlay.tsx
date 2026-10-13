"use client";

import { useEffect } from "react";

import { XIcon } from "@primer/octicons-react";

import type { CalendarMeetingOverlayLayout } from "../../calendar/calendar-meeting-overlay.js";
import { isNativeDatePickerOpen } from "../../dropdowns/native-date-picker.js";
import { isSearchableDropdownPanelOpen } from "../../list-nav/should-handle-list-keyboard-navigation.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "../../shortcuts/shortcut-guards.js";
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
  /**
   * `rail` — in-rail layer that replaces the meetings list.
   * `overlay` — absolute overlay (used for full-page expand).
   */
  placement?: "rail" | "overlay";
  /** When false, omit expand/hide chrome (parent rail owns those controls). */
  showChrome?: boolean;
} & MeetingDetailViewProps;

/**
 * Meeting detail for the calendar right rail (panel) or full-page overlay.
 */
export function CalendarMeetingDetailOverlay({
  open,
  onClose,
  overlayLayout = "panel",
  onExpand,
  onCollapse,
  placement,
  showChrome = true,
  ...detailProps
}: CalendarMeetingDetailOverlayProps) {
  const layout = overlayLayout === "page" ? "page" : "panel";
  const resolvedPlacement =
    placement ?? (layout === "page" ? "overlay" : "rail");

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Enter" &&
        layout === "panel" &&
        onExpand &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onExpand();
        return;
      }

      if (event.key !== "Escape") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (isBlockingModalOpen()) return;

      // Schedule / due-date / searchable property panels own Escape first.
      if (isSearchableDropdownPanelOpen() || isNativeDatePickerOpen()) {
        return;
      }

      // Close even while the title or markdown body is focused — Escape leaves
      // the meeting note, not only when focus is outside editors.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (layout === "page" && onCollapse) {
        onCollapse();
        return;
      }
      onClose();
    }

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
      title={layout === "page" ? "Close meeting" : "Close (Esc)"}
      aria-label="Close meeting"
    >
      <XIcon size={14} />
    </button>
  );

  return (
    <aside
      className={[
        "calendar-meeting-detail-overlay",
        layout === "page" ? "calendar-meeting-detail-overlay--page" : null,
        resolvedPlacement === "rail"
          ? "calendar-meeting-detail-overlay--rail"
          : "calendar-meeting-detail-overlay--overlay",
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
        {showChrome ? (
          <div
            className="desktop-journal-day-layout__chrome calendar-meeting-detail-overlay__chrome"
            data-calendar-meeting-overlay-chrome=""
          >
            <div className="desktop-agent-surface-tab-actions calendar-meeting-detail-overlay__chrome-start">
              {layoutAction}
            </div>
            <div className="desktop-agent-surface-tab-actions calendar-meeting-detail-overlay__chrome-end">
              {detailProps.headerMoreAction ?? null}
              {hideAction}
            </div>
          </div>
        ) : null}
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
