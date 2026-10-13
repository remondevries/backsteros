import { useMemo, type ReactNode } from "react";

import type { CalendarPageMode } from "../../calendar/calendar-page-mode.js";
import { CALENDAR_PAGE_MODE_OPTIONS } from "../../calendar/calendar-page-mode.js";
import { AvailabilityModeIcon } from "../icons/availability-mode-icon.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { TimetrackingModeIcon } from "../icons/timetracking-mode-icon.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";

const MODE_ICONS: Record<CalendarPageMode, ReactNode> = {
  calendar: <CalendarIcon size={16} />,
  timetracking: <TimetrackingModeIcon size={16} />,
  availability: <AvailabilityModeIcon size={16} />,
};

export function CalendarSidePanelModeFooter({
  pageMode,
  onPageModeChange,
}: {
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
}) {
  const options = useMemo<SegmentedPillToggleOption<CalendarPageMode>[]>(
    () =>
      CALENDAR_PAGE_MODE_OPTIONS.map((option) => ({
        ...option,
        icon: MODE_ICONS[option.value],
      })),
    [],
  );

  return (
    <div className="calendar-side-panel__footer">
      <SegmentedPillToggle
        value={pageMode}
        options={options}
        onChange={onPageModeChange}
        ariaLabel="Calendar page mode"
      />
    </div>
  );
}
