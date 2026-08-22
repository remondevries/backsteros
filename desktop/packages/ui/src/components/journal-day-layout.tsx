"use client";

import type { ReactNode } from "react";

import { JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY } from "../journal/journal.js";
import { ResizableSidePanel } from "./resizable-side-panel.js";

export type JournalDayLayoutProps = {
  main: ReactNode;
  dayCalendar: ReactNode;
  panelWidthKey?: string;
};

/**
 * Journal entry body with a resizable day timeline on the right (task chat
 * panel pattern).
 */
export function JournalDayLayout({
  main,
  dayCalendar,
  panelWidthKey = JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY,
}: JournalDayLayoutProps) {
  return (
    <div
      className="journal-day-layout"
      data-content-detail
      data-detail-split
    >
      <div className="journal-day-layout__main">{main}</div>
      <ResizableSidePanel
        storageKey={panelWidthKey}
        defaultWidth={320}
        minWidth={260}
        maxWidth={480}
        edge="start"
        className="journal-day-layout__calendar"
      >
        {dayCalendar}
      </ResizableSidePanel>
    </div>
  );
}
