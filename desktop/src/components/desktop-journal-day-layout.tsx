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
  /**
   * Optional leading chrome (e.g. expand/collapse layout icons on Catalog
   * Domains — same placement as contacts/orgs).
   */
  chromeStart?: ReactNode;
  /**
   * Optional trailing chrome before the hide/close button (e.g. entity ⋯ menu).
   */
  chromeEnd?: ReactNode;
  /**
   * When false, omit the rail chrome row (e.g. entity detail in the rail
   * already provides expand/hide controls).
   */
  showChrome?: boolean;
  /**
   * Override the trailing chrome hide/toggle action (e.g. close a detail
   * view and return to the list instead of collapsing the rail).
   */
  onChromeHide?: () => void;
  /** Optional icon for the trailing chrome button (defaults to side-panel toggle). */
  chromeHideIcon?: ReactNode;
  storageKey?: string;
  panelAriaLabel?: string;
  showPanelLabel?: string;
  hidePanelLabel?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Controlled collapse (strip vs open panel). */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  defaultCollapsed?: boolean;
};

/**
 * Main column + collapsible right `ResizableSidePanel` (]` toggle).
 * Shared by Journal day timeline, Catalog, and similar splits.
 */
export function DesktopCollapsibleRightSidePanelLayout({
  main,
  sidePanel,
  chromeStart = null,
  chromeEnd = null,
  showChrome = true,
  onChromeHide,
  chromeHideIcon = null,
  storageKey = JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY,
  panelAriaLabel = "Side panel",
  showPanelLabel = "Show side panel",
  hidePanelLabel = "Hide side panel",
  defaultWidth = 320,
  minWidth = 260,
  maxWidth = 480,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  defaultCollapsed = false,
}: DesktopCollapsibleRightSidePanelLayoutProps) {
  const [uncontrolledCollapsed, setUncontrolledCollapsed] =
    useState(defaultCollapsed);
  const panelCollapsed = controlledCollapsed ?? uncontrolledCollapsed;

  const setPanelCollapsed = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const resolve = (current: boolean) =>
        typeof next === "function" ? next(current) : next;
      if (controlledCollapsed === undefined) {
        setUncontrolledCollapsed((current) => {
          const value = resolve(current);
          onCollapsedChange?.(value);
          return value;
        });
        return;
      }
      onCollapsedChange?.(resolve(controlledCollapsed));
    },
    [controlledCollapsed, onCollapsedChange],
  );

  const showPanel = useCallback(() => {
    setPanelCollapsed(false);
  }, [setPanelCollapsed]);

  const hidePanel = useCallback(() => {
    setPanelCollapsed(true);
  }, [setPanelCollapsed]);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((current) => !current);
  }, [setPanelCollapsed]);

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
          {showChrome ? (
            <div
              className={[
                "desktop-journal-day-layout__chrome",
                chromeStart
                  ? "desktop-journal-day-layout__chrome--with-start"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {chromeStart ? (
                <div className="desktop-agent-surface-tab-actions desktop-journal-day-layout__chrome-start">
                  {chromeStart}
                </div>
              ) : null}
              <div className="desktop-agent-surface-tab-actions desktop-journal-day-layout__chrome-end">
                {chromeEnd}
                <button
                  type="button"
                  className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                  onClick={onChromeHide ?? hidePanel}
                  title={`${hidePanelLabel}${onChromeHide ? "" : " (])"}`}
                  aria-label={hidePanelLabel}
                >
                  {chromeHideIcon ?? (
                    <ProjectsSidePanelIcon
                      size={16}
                      collapsed={false}
                      rail="end"
                    />
                  )}
                </button>
              </div>
            </div>
          ) : null}
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
