"use client";

import type { ReactNode } from "react";

import { CONTACT_DETAIL_PANEL_WIDTH_KEY } from "../../contacts/contact-overlay.js";
import { ProjectsSidePanelIcon } from "../codebase/projects-side-panel-icon.js";
import { ResizableSidePanel } from "../shell/resizable-side-panel.js";

export type ContactDetailOverlayProps = {
  open: boolean;
  /** When true, show the narrow reopen strip instead of the detail panel. */
  collapsed?: boolean;
  onClose: () => void;
  onHide?: () => void;
  onShow?: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Right-side contact profile panel — same resizable + hide/show strip pattern
 * as journal day timeline / task agent rail (`]`).
 */
export function ContactDetailOverlay({
  open,
  collapsed = false,
  onClose,
  onHide,
  onShow,
  title,
  children,
}: ContactDetailOverlayProps) {
  if (!open) return null;

  if (collapsed) {
    return (
      <aside
        className="journal-day-layout__calendar is-collapsed contact-detail-panel"
        aria-label={title}
        data-contact-overlay=""
        data-contact-overlay-layout="collapsed"
      >
        <button
          type="button"
          className="desktop-terminal-strip"
          title="Show contact (])"
          aria-label={`Show ${title}`}
          onClick={onShow}
        >
          <ProjectsSidePanelIcon size={16} collapsed rail="end" />
        </button>
      </aside>
    );
  }

  return (
    <ResizableSidePanel
      storageKey={CONTACT_DETAIL_PANEL_WIDTH_KEY}
      defaultWidth={380}
      minWidth={300}
      maxWidth={720}
      edge="start"
      className="journal-day-layout__calendar contact-detail-panel"
    >
      <div
        className="desktop-journal-day-layout__chrome contact-detail-panel__chrome"
        role="dialog"
        aria-modal="false"
        aria-label={title}
        data-contact-overlay=""
        data-contact-overlay-layout="panel"
      >
        <div className="desktop-agent-surface-tab-actions">
          {onHide ? (
            <button
              type="button"
              className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
              onClick={onHide}
              title="Hide contact (])"
              aria-label="Hide contact"
            >
              <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
            </button>
          ) : null}
          <button
            type="button"
            className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
            onClick={onClose}
            title="Close contact (Esc)"
            aria-label="Close contact"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="desktop-journal-day-layout__calendar-body contact-detail-panel__body">
        {children}
      </div>
    </ResizableSidePanel>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
