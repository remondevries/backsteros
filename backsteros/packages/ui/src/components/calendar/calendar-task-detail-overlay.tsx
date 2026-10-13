"use client";

import { XIcon } from "@primer/octicons-react";
import { useEffect, type ReactNode } from "react";

import type { CalendarTaskOverlayLayout } from "../../calendar/calendar-task-overlay.js";
import { isNativeDatePickerOpen } from "../../dropdowns/native-date-picker.js";
import { isSearchableDropdownPanelOpen } from "../../list-nav/should-handle-list-keyboard-navigation.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "../../shortcuts/shortcut-guards.js";
import { CollapseLayoutIcon } from "../icons/collapse-layout-icon.js";
import { ExpandLayoutIcon } from "../icons/expand-layout-icon.js";

export type CalendarTaskDetailOverlayProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  /** Narrow right panel vs full-width page layout over the calendar. */
  overlayLayout?: CalendarTaskOverlayLayout;
  /** Expand the narrow panel to full-width page layout. */
  onExpand?: () => void;
  /** Collapse full-width page layout back to the narrow panel. */
  onCollapse?: () => void;
  /**
   * `rail` — render as an in-rail layer (parent owns positioning).
   * `overlay` — absolute overlay over the calendar page (default for page layout).
   */
  placement?: "rail" | "overlay";
  /** When false, omit expand/hide chrome (parent rail owns those controls). */
  showChrome?: boolean;
};

/**
 * Task detail for the calendar right rail (panel) or full-page overlay.
 * Mirrors meeting overlay chrome: hide + expand/collapse layout.
 */
export function CalendarTaskDetailOverlay({
  open,
  onClose,
  children,
  ariaLabel = "Task details",
  overlayLayout = "panel",
  onExpand,
  onCollapse,
  placement,
  showChrome = true,
}: CalendarTaskDetailOverlayProps) {
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

      // Due-date calendar / searchable property panels own Escape first.
      if (isSearchableDropdownPanelOpen() || isNativeDatePickerOpen()) {
        return;
      }

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

  const layoutAction =
    layout === "panel" && onExpand ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon calendar-task-detail-overlay__layout-action"
        onClick={onExpand}
        aria-label="Expand task"
        title="Expand (Enter)"
      >
        <ExpandLayoutIcon size={14} />
      </button>
    ) : layout === "page" && onCollapse ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon calendar-task-detail-overlay__layout-action"
        onClick={onCollapse}
        aria-label="Collapse task"
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
      title={layout === "page" ? "Close task" : "Close (Esc)"}
      aria-label="Close task"
    >
      <XIcon size={14} />
    </button>
  );

  return (
    <aside
      className={[
        "calendar-task-detail-overlay",
        layout === "page"
          ? "calendar-task-detail-overlay--page"
          : "calendar-task-detail-overlay--panel",
        resolvedPlacement === "rail"
          ? "calendar-task-detail-overlay--rail"
          : "calendar-task-detail-overlay--overlay",
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      data-calendar-task-overlay=""
      data-calendar-task-overlay-layout={layout}
    >
      <div className="calendar-task-detail-overlay__card">
        {showChrome ? (
          <div
            className="desktop-journal-day-layout__chrome calendar-task-detail-overlay__chrome"
            data-calendar-task-overlay-chrome=""
          >
            <div className="desktop-agent-surface-tab-actions calendar-task-detail-overlay__chrome-start">
              {layoutAction}
            </div>
            <div className="desktop-agent-surface-tab-actions calendar-task-detail-overlay__chrome-end">
              {hideAction}
            </div>
          </div>
        ) : null}
        <div className="calendar-task-detail-overlay__body">{children}</div>
      </div>
    </aside>
  );
}
