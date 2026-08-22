import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY,
  ProjectsSidePanelIcon,
  ResizableSidePanel,
  shouldHandleGlobalShortcut,
} from "@backsteros/ui";

import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";

export type DesktopJournalDayLayoutProps = {
  main: ReactNode;
  dayCalendar: ReactNode;
};

/**
 * Journal day entry with a collapsible day timeline on the right — mirrors the
 * task agent panel hide/show strip and ] shortcut.
 */
export function DesktopJournalDayLayout({
  main,
  dayCalendar,
}: DesktopJournalDayLayoutProps) {
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);

  const showCalendar = useCallback(() => {
    setCalendarCollapsed(false);
  }, []);

  const hideCalendar = useCallback(() => {
    setCalendarCollapsed(true);
  }, []);

  const toggleCalendar = useCallback(() => {
    setCalendarCollapsed((current) => !current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleCalendar();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleCalendar]);

  return (
    <div
      className={[
        "journal-day-layout",
        "desktop-journal-day-layout",
        calendarCollapsed ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={calendarCollapsed ? "true" : "false"}
    >
      <div className="journal-day-layout__main">{main}</div>
      {calendarCollapsed ? (
        <aside
          className="journal-day-layout__calendar is-collapsed"
          aria-label="Day timeline"
        >
          <button
            type="button"
            className="desktop-terminal-strip"
            title="Show day timeline (])"
            aria-label="Show day timeline"
            onClick={showCalendar}
          >
            <ProjectsSidePanelIcon size={16} collapsed rail="end" />
          </button>
        </aside>
      ) : (
        <ResizableSidePanel
          storageKey={JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY}
          defaultWidth={320}
          minWidth={260}
          maxWidth={480}
          edge="start"
          className="journal-day-layout__calendar"
        >
          <div className="desktop-journal-day-layout__chrome">
            <div className="desktop-agent-surface-tab-actions">
              <button
                type="button"
                className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                onClick={hideCalendar}
                title="Hide day timeline (])"
                aria-label="Hide day timeline"
              >
                <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
              </button>
            </div>
          </div>
          <div className="desktop-journal-day-layout__calendar-body">
            {dayCalendar}
          </div>
        </ResizableSidePanel>
      )}
    </div>
  );
}