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

export type DesktopCollapsibleRightSidePanelLayoutProps = {
  main: ReactNode;
  /** Right rail body (day timeline, empty scaffold, …). */
  sidePanel: ReactNode;
  storageKey?: string;
  panelAriaLabel?: string;
  showPanelLabel?: string;
  hidePanelLabel?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
};

/**
 * Main column + collapsible right `ResizableSidePanel` (]` toggle).
 * Shared by Journal day timeline, Development, and similar splits.
 */
export function DesktopCollapsibleRightSidePanelLayout({
  main,
  sidePanel,
  storageKey = JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY,
  panelAriaLabel = "Side panel",
  showPanelLabel = "Show side panel",
  hidePanelLabel = "Hide side panel",
  defaultWidth = 320,
  minWidth = 260,
  maxWidth = 480,
}: DesktopCollapsibleRightSidePanelLayoutProps) {
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const showPanel = useCallback(() => {
    setPanelCollapsed(false);
  }, []);

  const hidePanel = useCallback(() => {
    setPanelCollapsed(true);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((current) => !current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      togglePanel();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [togglePanel]);

  return (
    <div
      className={[
        "journal-day-layout",
        "desktop-journal-day-layout",
        panelCollapsed ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={panelCollapsed ? "true" : "false"}
    >
      <div className="journal-day-layout__main">{main}</div>
      {panelCollapsed ? (
        <aside
          className="journal-day-layout__calendar is-collapsed"
          aria-label={panelAriaLabel}
        >
          <button
            type="button"
            className="desktop-terminal-strip"
            title={`${showPanelLabel} (])`}
            aria-label={showPanelLabel}
            onClick={showPanel}
          >
            <ProjectsSidePanelIcon size={16} collapsed rail="end" />
          </button>
        </aside>
      ) : (
        <ResizableSidePanel
          storageKey={storageKey}
          defaultWidth={defaultWidth}
          minWidth={minWidth}
          maxWidth={maxWidth}
          edge="start"
          className="journal-day-layout__calendar"
        >
          <div className="desktop-journal-day-layout__chrome">
            <div className="desktop-agent-surface-tab-actions">
              <button
                type="button"
                className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                onClick={hidePanel}
                title={`${hidePanelLabel} (])`}
                aria-label={hidePanelLabel}
              >
                <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
              </button>
            </div>
          </div>
          <div className="desktop-journal-day-layout__calendar-body">
            {sidePanel}
          </div>
        </ResizableSidePanel>
      )}
    </div>
  );
}

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
  return (
    <DesktopCollapsibleRightSidePanelLayout
      main={main}
      sidePanel={dayCalendar}
      storageKey={JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY}
      panelAriaLabel="Day timeline"
      showPanelLabel="Show day timeline"
      hidePanelLabel="Hide day timeline"
    />
  );
}
