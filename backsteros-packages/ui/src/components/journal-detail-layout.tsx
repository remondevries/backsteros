"use client";

import {
  formatJournalEntryTitle,
  formatJournalSidePanelLabel,
} from "../journal.js";
import { JournalNavIcon } from "./sidebar-nav-icons.js";

export type JournalDetailLayoutProps = {
  dateSlug: string | null;
  title?: string | null;
  body?: string | null;
  resolving?: boolean;
};

/**
 * Journal main pane chrome — breadcrumb + title + body placeholder.
 * Full markdown / Whoop / due-tasks come later.
 */
export function JournalDetailLayout({
  dateSlug,
  title,
  body,
  resolving = false,
}: JournalDetailLayoutProps) {
  if (resolving) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-breadcrumb">
          <span>Journal</span>
        </div>
        <div className="inbox-detail-empty">
          <p>Loading journal…</p>
        </div>
      </div>
    );
  }

  if (!dateSlug) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-breadcrumb">
          <span>Journal</span>
        </div>
        <div className="inbox-detail-empty">
          <p>
            No journal entries yet. Use the plus button in the side panel for
            today.
          </p>
        </div>
      </div>
    );
  }

  const heading = title?.trim() || formatJournalEntryTitle(dateSlug);
  const crumb = formatJournalSidePanelLabel(dateSlug);

  return (
    <div className="inbox-detail-layout">
      <div className="inbox-detail-breadcrumb">
        <span>
          Journal
          {" / "}
          <strong>{crumb}</strong>
        </span>
      </div>
      <div className="inbox-detail-body">
        <div className="journal-detail-title-row">
          <span className="journal-detail-icon" aria-hidden="true">
            <JournalNavIcon />
          </span>
          <h1 className="inbox-detail-title">{heading}</h1>
        </div>
        <div className="inbox-detail-description">
          {body?.trim()
            ? body
            : "Journal entry body will appear here when synced."}
        </div>
      </div>
    </div>
  );
}
