import {
  CalendarAvailabilitySidePanelView,
  CalendarSidePanelModeFooter,
  ContentSidePanelEmpty,
  ContentSidePanelHeader,
  type CalendarPageMode,
} from "@backsteros/ui";

import { useMeetingSchedulingSettings } from "../../lib/use-meeting-scheduling-settings";

/** Availability body — chrome owned by DesktopCalendarSidePanel when embedded. */
export function DesktopCalendarAvailabilitySidePanel({
  embedded = false,
  pageMode,
  onPageModeChange,
}: {
  embedded?: boolean;
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
}) {
  const { settings, loading, setWeekdayHours } = useMeetingSchedulingSettings();

  if (!settings) {
    if (embedded) {
      return (
        <ContentSidePanelEmpty>
          {loading
            ? "Loading availability…"
            : "Unable to load availability settings."}
        </ContentSidePanelEmpty>
      );
    }
    return (
      <div className="app-content-side-panel calendar-side-panel calendar-availability-side-panel">
        <ContentSidePanelHeader title="Availability" />
        <div className="app-content-side-panel-main">
          <ContentSidePanelEmpty>
            {loading
              ? "Loading availability…"
              : "Unable to load availability settings."}
          </ContentSidePanelEmpty>
        </div>
        <CalendarSidePanelModeFooter
          pageMode={pageMode}
          onPageModeChange={onPageModeChange}
        />
      </div>
    );
  }

  return (
    <CalendarAvailabilitySidePanelView
      weekdayHours={settings.weekdayHours}
      loading={loading}
      pageMode={pageMode}
      onPageModeChange={onPageModeChange}
      onWeekdayHoursChange={setWeekdayHours}
      embedded={embedded}
    />
  );
}
