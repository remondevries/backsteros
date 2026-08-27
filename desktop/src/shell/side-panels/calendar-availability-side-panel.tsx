

import {
  CalendarAvailabilitySidePanelView,
  CalendarSidePanelModeFooter,
  ContentSidePanelEmpty,
  ContentSidePanelHeader,
} from "@backsteros/ui";

import { useMeetingSchedulingSettings } from "../../lib/use-meeting-scheduling-settings";
import { useCalendarPageModeControls } from "../../lib/use-calendar-page-mode";

export function DesktopCalendarAvailabilitySidePanel() {
  const { settings, loading, setWeekdayHours } = useMeetingSchedulingSettings();
  const { pageMode, handlePageModeChange } = useCalendarPageModeControls();

  if (!settings) {
    return (
      <div className="app-content-side-panel calendar-side-panel calendar-availability-side-panel">
        <ContentSidePanelHeader title="Availability" />
        <div className="app-content-side-panel-main">
          <ContentSidePanelEmpty>
            {loading ? "Loading availability…" : "Unable to load availability settings."}
          </ContentSidePanelEmpty>
        </div>
        <CalendarSidePanelModeFooter
          pageMode={pageMode}
          onPageModeChange={handlePageModeChange}
        />
      </div>
    );
  }
  return (
    <CalendarAvailabilitySidePanelView
      weekdayHours={settings.weekdayHours}
      loading={loading}
      pageMode={pageMode}
      onPageModeChange={handlePageModeChange}
      onWeekdayHoursChange={setWeekdayHours}
    />
  );
}
