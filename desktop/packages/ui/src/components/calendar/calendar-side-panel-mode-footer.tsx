import type { CalendarPageMode } from "../../calendar/calendar-page-mode.js";
import { CALENDAR_PAGE_MODE_OPTIONS } from "../../calendar/calendar-page-mode.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";

export function CalendarSidePanelModeFooter({
  pageMode,
  onPageModeChange,
}: {
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
}) {
  return (
    <div className="calendar-side-panel__footer">
      <SegmentedPillToggle
        value={pageMode}
        options={CALENDAR_PAGE_MODE_OPTIONS}
        onChange={onPageModeChange}
        ariaLabel="Calendar page mode"
      />
    </div>
  );
}
